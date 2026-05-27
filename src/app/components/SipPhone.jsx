'use client';

import { useState, useRef, useEffect } from 'react';
import JsSIP from 'jssip';
import { Phone, PhoneOff, Delete, Shield, User, Server } from 'lucide-react';

export default function SipPhone() {
  const [sipUser, setSipUser] = useState(process.env.NEXT_PUBLIC_DEFAULT_SIP_USER || '');
  const [password, setPassword] = useState('');
  const [wssServer, setWssServer] = useState(process.env.NEXT_PUBLIC_SIP_SERVER || '');

  const [phoneNumber, setPhoneNumber] = useState('');
  const [isRegistered, setIsRegistered] = useState(false);
  const [callStatus, setCallStatus] = useState('Disconnected');
  const [isConnecting, setIsConnecting] = useState(false);
  
  const uaRef = useRef(null);
  const sessionRef = useRef(null);
  const remoteAudioRef = useRef(null);

  // ব্রাউজার লেভেলে JsSIP এর ডিবাগ লগার বন্ধ রাখার জন্য (কনসোল ক্লিন রাখবে)
  useEffect(() => {
    JsSIP.debug.disable('JsSIP:*');
  }, []);

  // ১. SIP সার্ভারে রেজিস্ট্রেশন লজিক
  const handleRegister = (e) => {
    e.preventDefault();
    if (!sipUser || !password || !wssServer) return alert("দয়া করে সব তথ্য সঠিকভাবে দিন!");

    setIsConnecting(true);
    setCallStatus('Connecting...');

    const socket = new JsSIP.WebSocketInterface(wssServer);
    const domain = wssServer.replace('wss://', '').split(':')[0].split('/')[0];

    const configuration = {
      sockets: [socket],
      uri: `sip:${sipUser}@${domain}`,
      password: password,
      register: true,
      register_expires: 120 // ২ মিনিট পর পর রেজিস্ট্রেশন রিনিউ হবে
    };

    const ua = new JsSIP.UA(configuration);
    uaRef.current = ua;

    // ইভেন্ট লিসেনারসমূহ
    ua.on('registered', () => {
      setIsRegistered(true);
      setIsConnecting(false);
      setCallStatus('Online / Ready');
    });

    ua.on('unregistered', () => {
      setIsRegistered(false);
      setCallStatus('Disconnected');
    });

    ua.on('registrationFailed', (data) => {
      setIsConnecting(false);
      setIsRegistered(false);
      setCallStatus('Registration Failed');
      alert(`কানেকশন ব্যর্থ হয়েছে: ${data.cause}`);
    });

    ua.on('newRTCSession', (data) => {
      const session = data.session;
      sessionRef.current = session;

      if (session.direction === 'outgoing') {
        setCallStatus('Ringing...');
      }

      // স্ট্রিম বা ভয়েস রিসিভ হ্যান্ডলার
      session.on('peerconnection', (peerconnection) => {
        peerconnection.addEventListener('track', (event) => {
          if (remoteAudioRef.current && event.streams[0]) {
            remoteAudioRef.current.srcObject = event.streams[0];
            remoteAudioRef.current.play().catch(err => console.error("Audio play blocked", err));
          }
        });
      });

      session.on('confirmed', () => setCallStatus('In Call'));
      session.on('ended', () => {
        setCallStatus('Online / Ready');
        sessionRef.current = null;
      });
      session.on('failed', (event) => {
        setCallStatus(`Failed: ${event.cause}`);
        sessionRef.current = null;
      });
    });

    ua.start();
  };

  // ২. আউটগোয়িং কল করার লজিক
  const makeCall = () => {
    if (!uaRef.current || !isRegistered) return alert("প্রথমে সার্ভারে কানেক্ট করুন!");
    if (!phoneNumber) return alert("নম্বর ইনপুট দিন!");

    const options = {
      mediaConstraints: { audio: true, video: false },
      rtcOfferConstraints: { offerToReceiveAudio: 1, offerToReceiveVideo: 0 }
    };

    const domain = wssServer.replace('wss://', '').split(':')[0].split('/')[0];
    uaRef.current.call(`sip:${phoneNumber}@${domain}`, options);
  };

  // ৩. কল ডিসকানেক্ট বা কেটে দেওয়ার লজিক
  const hangUp = () => {
    if (sessionRef.current) {
      sessionRef.current.terminate();
    }
  };

  // ডায়ালপ্যাড কন্ট্রোলস
  const handleKeyPress = (val) => setPhoneNumber(prev => prev + val);
  const handleDelete = () => setPhoneNumber(prev => prev.slice(0, -1));

  return (
    <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-2xl backdrop-blur-md">
      <audio ref={remoteAudioRef} autoPlay />

      {/* ব্র্যান্ড হেডার */}
      <div className="text-center mb-6">
        <h1 className="text-2xl font-black text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 to-teal-500 tracking-wider">SCL CUSTOM DIALER</h1>
        <p className="text-xs text-slate-500 mt-1">Premium UI Softphone System</p>
      </div>

      {/* লগইন / কানেকশন ফর্ম */}
      {!isRegistered ? (
        <form onSubmit={handleRegister} className="space-y-3 mb-6 bg-slate-950 p-4 border border-slate-800/60 rounded-2xl">
          <div className="relative">
            <User size={16} className="absolute left-3 top-3.5 text-slate-500" />
            <input type="text" placeholder="SIP User ID" value={sipUser} onChange={e => setSipUser(e.target.value)} className="w-full bg-slate-900 border border-slate-800 rounded-xl p-3 pl-10 text-sm focus:outline-none focus:border-emerald-500 transition-colors" />
          </div>
          <div className="relative">
            <Shield size={16} className="absolute left-3 top-3.5 text-slate-500" />
            <input type="password" placeholder="SIP Password" value={password} onChange={e => setPassword(e.target.value)} className="w-full bg-slate-900 border border-slate-800 rounded-xl p-3 pl-10 text-sm focus:outline-none focus:border-emerald-500 transition-colors" />
          </div>
          <div className="relative">
            <Server size={16} className="absolute left-3 top-3.5 text-slate-500" />
            <input type="text" placeholder="WSS Server Address" value={wssServer} onChange={e => setWssServer(e.target.value)} className="w-full bg-slate-900 border border-slate-800 rounded-xl p-3 pl-10 text-sm focus:outline-none focus:border-emerald-500 transition-colors" />
          </div>
          <button type="submit" disabled={isConnecting} className="w-full bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 disabled:opacity-50 font-bold p-3 rounded-xl transition-all shadow-lg shadow-emerald-950/40 text-sm">
            {isConnecting ? 'Connecting...' : 'Connect to Server'}
          </button>
        </form>
      ) : (
        /* অনলাইন স্ট্যাটাস বার */
        <div className="flex items-center justify-between bg-slate-950 border border-slate-800/80 rounded-2xl p-4 mb-6">
          <div>
            <p className="text-[10px] uppercase font-bold tracking-wider text-slate-500">Active Caller Line</p>
            <p className="text-base font-bold text-slate-200 mt-0.5">{sipUser}</p>
          </div>
          <div className="flex items-center gap-2 bg-emerald-500/10 text-emerald-400 text-xs px-3 py-1.5 rounded-xl font-semibold border border-emerald-500/20 shadow-sm animate-pulse">
            <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
            Registered
          </div>
        </div>
      )}

      {/* মডার্ন ডায়াল স্ক্রিন ডিসপ্লে */}
      <div className="bg-slate-950 border border-slate-800/60 rounded-2xl p-4 mb-6 text-center relative overflow-hidden">
        <div className="absolute top-0 left-0 w-full h-[2px] bg-gradient-to-r from-transparent via-slate-700 to-transparent"></div>
        <p className="text-xs font-bold uppercase tracking-widest text-slate-500 mb-1">{callStatus}</p>
        <input type="text" value={phoneNumber} readOnly className="w-full bg-transparent text-center text-3xl font-black text-slate-100 tracking-widest focus:outline-none placeholder-slate-800" placeholder="017XXXXXXXX" />
      </div>

      {/* ১২-বাটন রেস্পনসিভ ডায়ালপ্যাড গ্রিড */}
      <div className="grid grid-cols-3 gap-3 mb-6">
        {['1', '2', '3', '4', '5', '6', '7', '8', '9', '*', '0', '#'].map((num) => (
          <button key={num} onClick={() => handleKeyPress(num)} className="aspect-square bg-slate-950 hover:bg-slate-800/80 active:scale-95 border border-slate-800 text-2xl font-bold rounded-2xl flex items-center justify-center transition-all shadow-sm active:bg-slate-700">
            {num}
          </button>
        ))}
      </div>

      {/* কল ট্রিলজি বাটন অ্যাকশন কন্ট্রোল */}
      <div className="flex justify-center items-center gap-8">
        <button onClick={handleDelete} className="p-4 bg-slate-950 hover:bg-slate-800 border border-slate-800 rounded-2xl transition-all text-slate-400 hover:text-slate-100 active:scale-90">
          <Delete size={22} />
        </button>

        {callStatus === 'In Call' || callStatus === 'Ringing...' ? (
          <button onClick={hangUp} className="p-5 bg-rose-600 hover:bg-rose-500 rounded-2xl shadow-xl shadow-rose-950/40 text-white transition-all transform active:scale-90 animate-bounce">
            <PhoneOff size={30} />
          </button>
        ) : (
          <button onClick={makeCall} className="p-5 bg-gradient-to-br from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 rounded-2xl shadow-xl shadow-emerald-950/50 text-white transition-all transform active:scale-90">
            <Phone size={30} />
          </button>
        )}

        <div className="w-[56px] h-[56px] invisible" /> {/* জ্যামিতিক ব্যালেন্স ঠিক রাখার জন্য খালি প্লেসহোল্ডার */}
      </div>
    </div>
  );
                 }
                 
