'use client';

import { useState, useEffect, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { Phone, PhoneOff, Video, VideoOff, LogIn, UserPlus, LogOut, Copy } from 'lucide-react';

export default function Home() {
  const [user, setUser] = useState(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSignUp, setIsSignUp] = useState(false);
  const [uniqueId, setUniqueId] = useState('');
  const [targetId, setTargetId] = useState('');
  const [callStatus, setCallStatus] = useState('Offline');

  // WebRTC Refs
  const pcRef = useRef(null);
  const channelRef = useRef(null);
  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);
  const localStreamRef = useRef(null);

  // STUN সার্ভার কনফিগারেশন (WebRTC নেটওয়ার্ক রুটিংয়ের জন্য)
  const rtcConfig = {
    iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
  };

  // ১. ইউজার অথেনটিকেশন চেক
  useEffect(() => {
    const getSession = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      handleUserSession(session?.user);
    };
    getSession();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      handleUserSession(session?.user);
    });

    return () => subscription.unsubscribe();
  }, []);

  const handleUserSession = (currentUser) => {
    if (currentUser) {
      setUser(currentUser);
      // ইমেইলের প্রথম অংশ এবং র‍্যান্ডম নম্বর দিয়ে ইউনিক আইডি তৈরি
      const idPart = currentUser.email.split('@')[0];
      const generatedId = `${idPart}-${currentUser.id.slice(0, 4)}`;
      setUniqueId(generatedId);
      setCallStatus('Ready / Online');
      initRealtimeSignaling(generatedId);
    } else {
      setUser(null);
      setUniqueId('');
      setCallStatus('Offline');
    }
  };

  // ২. Supabase রিয়েল-টাইম সিগন্যালিং চ্যানেল চালু করা
  const initRealtimeSignaling = (myId) => {
    const channel = supabase.channel(`call-channel-${myId}`, {
      config: { broadcast: { self: false } }
    });

    channel
      .on('broadcast', { event: 'offer' }, async ({ payload }) => {
        if (payload.to === myId) {
          setCallStatus(`Incoming call from ${payload.from}...`);
          setTargetId(payload.from);
          await handleIncomingCall(payload.offer);
        }
      })
      .on('broadcast', { event: 'answer' }, async ({ payload }) => {
        if (payload.to === myId && pcRef.current) {
          setCallStatus('Call Connected');
          await pcRef.current.setRemoteDescription(new RTCSessionDescription(payload.answer));
        }
      })
      .on('broadcast', { event: 'ice-candidate' }, async ({ payload }) => {
        if (payload.to === myId && pcRef.current) {
          try {
            await pcRef.current.addIceCandidate(new RTCIceCandidate(payload.candidate));
          } catch (e) {
            console.error("Error adding ice candidate", e);
          }
        }
      })
      .on('broadcast', { event: 'hangup' }, ({ payload }) => {
        if (payload.to === myId) {
          endCall();
        }
      })
      .subscribe();

    channelRef.current = channel;
  };

  // ৩. ক্যামেরা ও মাইক্রোফোন চালু করা
  const startLocalStream = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      localStreamRef.current = stream;
      if (localVideoRef.current) localVideoRef.current.srcObject = stream;
      return stream;
    } catch (err) {
      alert("ক্যামেরা বা মাইক্রোফোন অ্যাক্সেস পাওয়া যায়নি!");
    }
  };

  // ৪. আউটগোয়িং কল শুরু করা (Make Call)
  const makeCall = async () => {
    if (!targetId) return alert("যাকে কল করবেন তার ইউনিক আইডি দিন!");
    setCallStatus('Calling...');

    const stream = await startLocalStream();
    const pc = new RTCPeerConnection(rtcConfig);
    pcRef.current = pc;

    // লোকাল স্ট্রিম ট্র্যাকিং অ্যাড করা
    stream.getTracks().forEach(track => pc.addTrack(track, stream));

    // রিমোট স্ট্রিম রিসিভ করা
    pc.ontrack = (event) => {
      if (remoteVideoRef.current) remoteVideoRef.current.srcObject = event.streams[0];
    };

    // ICE Candidates পাঠানো
    pc.onicecandidate = (event) => {
      if (event.candidate && channelRef.current) {
        channelRef.current.send({
          type: 'broadcast',
          event: 'ice-candidate',
          payload: { to: targetId, candidate: event.candidate }
        });
      }
    };

    // WebRTC Offer তৈরি ও পাঠানো
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);

    channelRef.current.send({
      type: 'broadcast',
      event: 'offer',
      payload: { to: targetId, from: uniqueId, offer }
    });
  };

  // ৫. ইনকামিং কল হ্যান্ডেল ও রিসিভ করা (Answer Call)
  const handleIncomingCall = async (offer) => {
    const stream = await startLocalStream();
    const pc = new RTCPeerConnection(rtcConfig);
    pcRef.current = pc;

    stream.getTracks().forEach(track => pc.addTrack(track, stream));

    pc.ontrack = (event) => {
      if (remoteVideoRef.current) remoteVideoRef.current.srcObject = event.streams[0];
    };

    pc.onicecandidate = (event) => {
      if (event.candidate && channelRef.current) {
        channelRef.current.send({
          type: 'broadcast',
          event: 'ice-candidate',
          payload: { to: targetId, candidate: event.candidate }
        });
      }
    };

    await pc.setRemoteDescription(new RTCSessionDescription(offer));
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);

    channelRef.current.send({
      type: 'broadcast',
      event: 'answer',
      payload: { to: targetId, answer }
    });
    setCallStatus('Call Connected');
  };

  // ৬. কল কেটে দেওয়া (Hangup)
  const endCall = () => {
    if (channelRef.current && targetId) {
      channelRef.current.send({
        type: 'broadcast',
        event: 'hangup',
        payload: { to: targetId }
      });
    }
    endCallLocally();
  };

  const endCallLocally = () => {
    if (pcRef.current) {
      pcRef.current.close();
      pcRef.current = null;
    }
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(track => track.stop());
      localStreamRef.current = null;
    }
    if (localVideoRef.current) localVideoRef.current.srcObject = null;
    if (remoteVideoRef.current) remoteVideoRef.current.srcObject = null;
    setCallStatus('Ready / Online');
  };

  // অথেনটিকেশন ফাংশনসমূহ
  const handleAuth = async (e) => {
    e.preventDefault();
    if (isSignUp) {
      const { error } = await supabase.auth.signUp({ email, password });
      if (error) alert(error.message);
      else alert("সাইন-আপ সফল! ইমেইল ভেরিফাই করুন (যদি প্রয়োজন হয়)।");
    } else {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) alert(error.message);
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4 bg-slate-950 text-slate-100">
      <div className="w-full max-w-4xl bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-2xl backdrop-blur-md">
        
        {/* হেডার */}
        <div className="text-center mb-6 flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-black text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 to-teal-500 tracking-wider">SCL P2P VIDEO CALL</h1>
            <p className="text-xs text-slate-500 mt-1">Serverless WebRTC Peer-to-Peer</p>
          </div>
          {user && (
            <button onClick={() => supabase.auth.signOut()} className="flex items-center gap-2 text-xs bg-rose-600/20 hover:bg-rose-600 text-rose-400 hover:text-white px-3 py-2 rounded-xl transition-all">
              <LogOut size={14} /> Log Out
            </button>
          )}
        </div>

        {/* লগইন / সাইন-আপ ফর্ম */}
        {!user ? (
          <form onSubmit={handleAuth} className="max-w-md mx-auto space-y-4 bg-slate-950 p-6 border border-slate-800 rounded-2xl shadow-inner">
            <h2 className="text-lg font-bold text-center">{isSignUp ? 'নতুন অ্যাকাউন্ট তৈরি করুন' : 'লগইন করুন'}</h2>
            <input type="email" placeholder="Email Address" value={email} onChange={e => setEmail(e.target.value)} className="w-full bg-slate-900 border border-slate-800 rounded-xl p-3 text-sm focus:outline-none focus:border-emerald-500" required />
            <input type="password" placeholder="Password" value={password} onChange={e => setPassword(e.target.value)} className="w-full bg-slate-900 border border-slate-800 rounded-xl p-3 text-sm focus:outline-none focus:border-emerald-500" required />
            <button type="submit" className="w-full bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 font-bold p-3 rounded-xl transition-all shadow-lg text-sm flex items-center justify-center gap-2">
              {isSignUp ? <UserPlus size={16} /> : <LogIn size={16} />} {isSignUp ? 'Sign Up' : 'Sign In'}
            </button>
            <p className="text-xs text-center text-slate-500 cursor-pointer hover:underline" onClick={() => setIsSignUp(!isSignUp)}>
              {isSignUp ? 'অলরেডি অ্যাকাউন্ট আছে? লগইন করুন' : 'নতুন অ্যাকাউন্ট দরকার? সাইন-আপ করুন'}
            </p>
          </form>
        ) : (
          /* মেইন ড্যাশবোর্ড */
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            
            {/* বাম সাইডবার: কন্ট্রোল প্যানেল */}
            <div className="space-y-4">
              <div className="bg-slate-950 border border-slate-800 rounded-2xl p-4">
                <p className="text-[10px] uppercase font-bold text-slate-500">Your Unique Caller ID</p>
                <div className="flex items-center justify-between mt-1 bg-slate-900 p-2 rounded-xl border border-slate-800">
                  <span className="text-sm font-mono text-emerald-400 font-bold">{uniqueId}</span>
                  <button onClick={() => { navigator.clipboard.writeText(uniqueId); alert('আইডি কপি হয়েছে!'); }} className="text-slate-400 hover:text-white">
                    <Copy size={16} />
                  </button>
                </div>
              </div>

              <div className="bg-slate-950 border border-slate-800 rounded-2xl p-4 space-y-3">
                <p className="text-[10px] uppercase font-bold text-slate-500">Call Status: <span className="text-teal-400 font-normal">{callStatus}</span></p>
                <input type="text" placeholder="Target Unique ID" value={targetId} onChange={e => setTargetId(e.target.value)} className="w-full bg-slate-900 border border-slate-800 rounded-xl p-3 text-sm focus:outline-none focus:border-emerald-500 font-mono text-center tracking-wider text-emerald-400" />
                
                <div className="flex gap-2">
                  {callStatus.includes('Connected') || callStatus.includes('Calling') || callStatus.includes('Incoming') ? (
                    <button onClick={endCall} className="w-full bg-rose-600 hover:bg-rose-500 p-3 rounded-xl font-bold text-sm flex items-center justify-center gap-2 transition-all">
                      <PhoneOff size={16} /> Hang Up
                    </button>
                  ) : (
                    <button onClick={makeCall} className="w-full bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 p-3 rounded-xl font-bold text-sm flex items-center justify-center gap-2 transition-all">
                      <Phone size={16} /> Start Call
                    </button>
                  )}
                </div>
              </div>
            </div>

            {/* ডান সাইড: ভিডিও গ্রিড স্ক্রিন */}
            <div className="md:col-span-2 grid grid-cols-1 sm:grid-cols-2 gap-4 bg-slate-950 border border-slate-800 rounded-3xl p-4 min-h-[350px]">
              {/* রিমোট ভিডিও (অন্য জনের ক্যামেরা) */}
              <div className="bg-slate-900 rounded-2xl border border-slate-800 relative overflow-hidden flex items-center justify-center">
                <video ref={remoteVideoRef} autoPlay className="w-full h-full object-cover rounded-2xl transform scale-x-[-1]" />
                <div className="absolute bottom-3 left-3 bg-slate-950/80 px-3 py-1 rounded-xl text-xs border border-slate-800">Remote User</div>
              </div>

              {/* লোকাল ভিডিও (নিজের ক্যামেরা) */}
              <div className="bg-slate-900 rounded-2xl border border-slate-800 relative overflow-hidden flex items-center justify-center">
                <video ref={localVideoRef} autoPlay muted className="w-full h-full object-cover rounded-2xl transform scale-x-[-1]" />
                <div className="absolute bottom-3 left-3 bg-slate-950/80 px-3 py-1 rounded-xl text-xs border border-slate-800">You (Local)</div>
              </div>
            </div>

          </div>
        )}
      </div>
    </div>
  );
            }
        
