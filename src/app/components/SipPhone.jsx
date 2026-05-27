'use client';

import { useState, useRef, useEffect } from 'react';
import { Phone, PhoneOff, Delete, Shield, User, Server } from 'lucide-react';

export default function SipPhone() {
  const [sipUser, setSipUser] = useState('09649816573');
  const [password, setPassword] = useState('');
  const [janusServer, setJanusServer] = useState('wss://amarip.net/janus-ws');
  const [sipServerIp, setSipServerIp] = useState('103.170.231.10');

  const [phoneNumber, setPhoneNumber] = useState('');
  const [isRegistered, setIsRegistered] = useState(false);
  const [callStatus, setCallStatus] = useState('Disconnected');
  const [isConnecting, setIsConnecting] = useState(false);
  
  const janusRef = useRef(null);
  const sipPluginRef = useRef(null);
  const remoteAudioRef = useRef(null);

  // ১. Janus এবং SIP রেজিস্ট্রেশন লজিক
  const handleConnectAndRegister = (e) => {
    e.preventDefault();
    if (!sipUser || !password || !janusServer || !sipServerIp) {
      return alert("সবগুলো তথ্য সঠিকভাবে পূরণ করুন!");
    }

    if (typeof window === 'undefined' || !window.Janus) {
      return alert("Janus লাইব্রেরি এখনও লোড হয়নি, দয়া করে একটু অপেক্ষা করুন!");
    }

    setIsConnecting(true);
    setCallStatus('Connecting to Janus Gateway...');

    const Janus = window.Janus;

    // Janus ইনিশিয়েলাইজ
    Janus.init({
      debug: false,
      callback: () => {
        // সেশন তৈরি
        const janusInstance = new Janus({
          server: janusServer,
          success: () => {
            janusRef.current = janusInstance;
            setCallStatus('Gateway Connected. Attaching SIP Plugin...');

            // SIP প্লাগইন অ্যাটাচ করা
            janusInstance.attach({
              plugin: "janus.plugin.sip",
              opaqueId: "bdsip-" + Janus.randomString(12),
              success: (pluginHandle) => {
                sipPluginRef.current = pluginHandle;
                setCallStatus('Registering with Bangla Calling...');

                // বাংলা কলিং সার্ভারে REGISTER রিকোয়েস্ট পাঠানো
                const registerBody = {
                  request: "register",
                  type: "secret",
                  username: `sip:${sipUser}@${sipServerIp}`,
                  secret: password,
                  proxy: `sip:${sipServerIp}:5060`, // অরিজিনাল UDP পোর্ট
                  refresh: true
                };
                pluginHandle.send({ message: registerBody });
              },
              error: (error) => {
                console.error("Plugin attachment error", error);
                setCallStatus("Plugin Error");
                setIsConnecting(false);
              },
              onmessage: (msg, jsep) => {
                handleJanusMessage(msg, jsep);
              },
              onremotestream: (stream) => {
                // রিমোট ভয়েস/অডিও ট্র্যাক রিসিভ করা
                if (remoteAudioRef.current) {
                  remoteAudioRef.current.srcObject = stream;
                }
              },
              oncleanup: () => {
                setCallStatus("Cleaned up");
                setIsRegistered(false);
              }
            });
          },
          error: (err) => {
            alert(`Gateway connection failed: ${err}`);
            setIsConnecting(false);
            setCallStatus("Disconnected");
          }
        });
      }
    });
  };

  // ২. Janus থেকে আসা মেসেজ ও ইভেন্ট হ্যান্ডল করা
  const handleJanusMessage = (msg, jsep) => {
    console.log("Janus Message Received:", msg);
    const result = msg["result"];
    
    if (result && result["event"]) {
      const event = result["event"];
      
      if (event === "registered") {
        setIsRegistered(true);
        setIsConnecting(false);
        setCallStatus("Online / Ready");
      } else if (event === "registration_failed" || event === "failed") {
        setIsRegistered(false);
        setIsConnecting(false);
        setCallStatus("Registration Failed");
        alert(`রেজিস্ট্রেশন ব্যর্থ: ${result["error"] || "Unknown reason"}`);
      } else if (event === "calling") {
        setCallStatus("Ringing...");
      } else if (event === "accepted") {
        setCallStatus("In Call");
      } else if (event === "hangup") {
        setCallStatus("Online / Ready");
        if (remoteAudioRef.current) remoteAudioRef.current.srcObject = null;
      }
    }

    // যদি কোনো ইনকামিং কল আসে বা রিমোট অ্যান্সার (JSEP) আসে
    if (jsep) {
      sipPluginRef.current.handleRemoteJsep({ jsep: jsep });
    }
  };

  // ৩. আউটগোয়িং কল করার লজিক
  const makeCall = () => {
    if (!sipPluginRef.current || !isRegistered) return alert("প্রথমে সার্ভারে কানেক্ট করুন!");
    if (!phoneNumber) return alert("যাকে কল করবেন তার নম্বর দিন!");

    setCallStatus("Calling...");

    // Janus-কে কল করার বডি রিকোয়েস্ট
    const callBody = {
      request: "call",
      uri: `sip:${phoneNumber}@${sipServerIp}`
    };

    // ব্রাউজারের WebRTC অডিও অফার (JSEP) তৈরি করে কল ইনিশিয়েট করা
    sipPluginRef.current.createOffer({
      media: { audio: true, video: false }, // পিওর ভয়েস কল
      success: (jsep) => {
        sipPluginRef.current.send({ message: callBody, jsep: jsep });
      },
      error: (error) => {
        console.error("WebRTC Offer creation failed", error);
        setCallStatus("Call Setup Failed");
      }
    });
  };

  // ৪. কল কেটে দেওয়া (Hangup)
  const hangUp = () => {
    if (sipPluginRef.current) {
      const hangupBody = { request: "hangup" };
      sipPluginRef.current.send({ message: hangupBody });
      setCallStatus("Online / Ready");
    }
  };

  // ডায়ালপ্যাড ইনপুট ফাংশন
  const handleKeyPress = (val) => setPhoneNumber(prev => prev + val);
  const handleDelete = () => setPhoneNumber(prev => prev.slice(0, -1));

  return (
    <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-2xl backdrop-blur-md">
      {/* রিমোট অডিও এলিমেন্ট */}
      <audio ref={remoteAudioRef} autoPlay />

      <div className="text-center mb-6">
        <h1 className="text-2xl font-black text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 to-teal-500 tracking-wider">SCL CUSTOM DIALER</h1>
        <p className="text-xs text-slate-500 mt-1">Janus WebRTC Gateway Softphone</p>
      </div>

      {/* কনফিগারেশন লগইন ফরম */}
      {!isRegistered ? (
        <form onSubmit={handleConnectAndRegister} className="space-y-3 mb-6 bg-slate-950 p-4 border border-slate-800/60 rounded-2xl">
          <div className="relative">
            <User size={16} className="absolute left-3 top-3.5 text-slate-500" />
            <input type="text" placeholder="SIP User ID" value={sipUser} onChange={e => setSipUser(e.target.value)} className="w-full bg-slate-900 border border-slate-800 rounded-xl p-3 pl-10 text-sm focus:outline-none focus:border-emerald-500" />
          </div>
          <div className="relative">
            <Shield size={16} className="absolute left-3 top-3.5 text-slate-500" />
            <input type="password" placeholder="SIP Password" value={password} onChange={e => setPassword(e.target.value)} className="w-full bg-slate-900 border border-slate-800 rounded-xl p-3 pl-10 text-sm focus:outline-none focus:border-emerald-500" />
          </div>
          <div className="relative">
            <Server size={16} className="absolute left-3 top-3.5 text-slate-500" />
            <input type="text" placeholder="Janus WS URL" value={janusServer} onChange={e => setJanusServer(e.target.value)} className="w-full bg-slate-900 border border-slate-800 rounded-xl p-3 pl-10 text-sm focus:outline-none focus:border-emerald-500" />
          </div>
          <div className="relative">
            <Server size={16} className="absolute left-3 top-3.5 text-slate-500" />
            <input type="text" placeholder="SIP Server IP" value={sipServerIp} onChange={e => setSipServerIp(e.target.value)} className="w-full bg-slate-900 border border-slate-800 rounded-xl p-3 pl-10 text-sm focus:outline-none focus:border-emerald-500" />
          </div>
          <button type="submit" disabled={isConnecting} className="w-full bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 disabled:opacity-50 font-bold p-3 rounded-xl transition-all shadow-lg text-sm">
            {isConnecting ? 'Connecting...' : 'Connect & Register'}
          </button>
        </form>
      ) : (
        /* অনলাইন স্ট্যাটাস বার */
        <div className="flex items-center justify-between bg-slate-950 border border-slate-800/80 rounded-2xl p-4 mb-6">
          <div>
            <p className="text-[10px] uppercase font-bold tracking-wider text-slate-500">Active Caller Line</p>
            <p className="text-base font-bold text-slate-200 mt-0.5">{sipUser}</p>
          </div>
          <div className="flex items-center gap-2 bg-emerald-500/10 text-emerald-400 text-xs px-3 py-1.5 rounded-xl font-semibold border border-emerald-500/20 shadow-sm">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping"></span>
            Registered
          </div>
        </div>
      )}

      {/* ডিসপ্লে স্ক্রিন */}
      <div className="bg-slate-950 border border-slate-800/60 rounded-2xl p-4 mb-6 text-center relative overflow-hidden">
        <p className="text-xs font-bold uppercase tracking-widest text-slate-500 mb-1">{callStatus}</p>
        <input type="text" value={phoneNumber} readOnly className="w-full bg-transparent text-center text-3xl font-black text-slate-100 tracking-widest focus:outline-none" placeholder="017XXXXXXXX" />
      </div>

      {/* ডায়ালপ্যাড গ্রিড */}
      <div className="grid grid-cols-3 gap-3 mb-6">
        {['1', '2', '3', '4', '5', '6', '7', '8', '9', '*', '0', '#'].map((num) => (
          <button key={num} onClick={() => handleKeyPress(num)} className="aspect-square bg-slate-950 hover:bg-slate-800/80 active:scale-95 border border-slate-800 text-2xl font-bold rounded-2xl flex items-center justify-center transition-all">
            {num}
          </button>
        ))}
      </div>

      {/* কন্ট্রোল বাটন */}
      <div className="flex justify-center items-center gap-8">
        <button onClick={handleDelete} className="p-4 bg-slate-950 hover:bg-slate-800 border border-slate-800 rounded-2xl transition-all text-slate-400 hover:text-slate-100">
          <Delete size={22} />
        </button>

        {callStatus === 'In Call' || callStatus === 'Ringing...' ? (
          <button onClick={hangUp} className="p-5 bg-rose-600 hover:bg-rose-500 rounded-2xl shadow-xl text-white transition-all transform active:scale-90">
            <PhoneOff size={30} />
          </button>
        ) : (
          <button onClick={makeCall} className="p-5 bg-gradient-to-br from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 rounded-2xl shadow-xl text-white transition-all transform active:scale-90">
            <Phone size={30} />
          </button>
        )}
        <div className="w-[56px] h-[56px] invisible" />
      </div>
    </div>
  );
      }
          
