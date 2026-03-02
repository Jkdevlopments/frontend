import React, { useState, useEffect, useRef, useCallback } from "react";
import { io } from "socket.io-client";
import "./Home.css";

const socket = io("http://localhost:5000");

const Home = ({ user, setUser }) => {
  const [selectedChat, setSelectedChat] = useState(null);
  const [messages, setMessages] = useState([]);
  const [messagesByChat, setMessagesByChat] = useState({});
  const [input, setInput] = useState("");
  const [selectedFile, setSelectedFile] = useState(null);
  const [allUsers, setAllUsers] = useState([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState("connected");
  const [uploadProgress, setUploadProgress] = useState(0);
  const [isUploading, setIsUploading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [selectedAnalysis, setSelectedAnalysis] = useState(null);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [showAttachMenu, setShowAttachMenu] = useState(false);
  const [showProfileView, setShowProfileView] = useState(false);
  const [showMediaView, setShowMediaView] = useState(null);
  const [chatSettings, setChatSettings] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [audioBlob, setAudioBlob] = useState(null);
  const [audioUrl, setAudioUrl] = useState(null);
  const [recordingPermission, setRecordingPermission] = useState(false);
  const [audioDevices, setAudioDevices] = useState([]);
  const [selectedDevice, setSelectedDevice] = useState(null);
  const [showDeviceMenu, setShowDeviceMenu] = useState(false);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  
  // Call related states
  const [incomingCall, setIncomingCall] = useState(null);
  const [outgoingCall, setOutgoingCall] = useState(null);
  const [activeCall, setActiveCall] = useState(null);
  const [isCallActive, setIsCallActive] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [isVideoOff, setIsVideoOff] = useState(false);
  const [callDuration, setCallDuration] = useState(0);
  const [showCallWindow, setShowCallWindow] = useState(false);
  const [localStream, setLocalStream] = useState(null);
  const [remoteStream, setRemoteStream] = useState(null);
  const [peerConnection, setPeerConnection] = useState(null);
  const [callType, setCallType] = useState(null);
  const [isCallConnecting, setIsCallConnecting] = useState(false);
  
  const messagesEndRef = useRef(null);
  const fileInputRef = useRef(null);
  const typingTimeoutRef = useRef(null);
  const attachMenuRef = useRef(null);
  const recordingTimerRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);
  const callDurationTimerRef = useRef(null);

  const configuration = {
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' },
      { urls: 'stun:stun2.l.google.com:19302' },
      { urls: 'stun:stun3.l.google.com:19302' },
      { urls: 'stun:stun4.l.google.com:19302' },
    ]
  };

  // ================= HELPER FUNCTIONS =================
  const formatMessageTime = useCallback((date) => {
    const now = new Date();
    const diff = now - date;
    
    if (diff < 60000) return 'Just now';
    if (diff < 3600000) return `${Math.floor(diff / 60000)} min`;
    if (diff < 86400000) return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    if (diff < 604800000) return date.toLocaleDateString([], { weekday: 'short' });
    return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
  }, []);

  const formatChatTime = useCallback((timestamp) => {
    if (!timestamp) return '';
    const date = new Date(timestamp);
    const now = new Date();
    const diff = now - date;
    
    if (diff < 86400000) {
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } else if (diff < 604800000) {
      return date.toLocaleDateString([], { weekday: 'short' });
    } else {
      return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
    }
  }, []);

  const formatRecordingTime = useCallback((seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  }, []);

  const showToast = useCallback((message, type = 'info') => {
    const toast = document.createElement('div');
    toast.className = `toast-notification ${type}`;
    toast.textContent = message;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
  }, []);

  // ================= CALL FUNCTIONS =================
  const endCall = useCallback(() => {
    if (peerConnection) {
      peerConnection.close();
      setPeerConnection(null);
    }
    if (localStream) {
      localStream.getTracks().forEach(track => track.stop());
      setLocalStream(null);
    }
    if (remoteStream) {
      remoteStream.getTracks().forEach(track => track.stop());
      setRemoteStream(null);
    }

    if (isCallActive || outgoingCall) {
      socket.emit("endCall", {
        targetId: activeCall?.with || outgoingCall?.to
      });
    }

    setIsCallActive(false);
    setActiveCall(null);
    setOutgoingCall(null);
    setIncomingCall(null);
    setShowCallWindow(false);
    setCallDuration(0);
    setIsMuted(false);
    setIsVideoOff(false);
    setIsCallConnecting(false);
    
    if (callDurationTimerRef.current) {
      clearInterval(callDurationTimerRef.current);
    }
    
    // Clear video elements
    if (localVideoRef.current) {
      localVideoRef.current.srcObject = null;
    }
    if (remoteVideoRef.current) {
      remoteVideoRef.current.srcObject = null;
    }
  }, [peerConnection, localStream, remoteStream, isCallActive, outgoingCall, activeCall]);

  const cleanupCall = useCallback(() => {
    if (localStream) {
      localStream.getTracks().forEach(track => track.stop());
    }
    if (peerConnection) {
      peerConnection.close();
    }
    setLocalStream(null);
    setRemoteStream(null);
    setPeerConnection(null);
  }, [localStream, peerConnection]);

  const startCallTimer = useCallback(() => {
    callDurationTimerRef.current = setInterval(() => {
      setCallDuration(prev => prev + 1);
    }, 1000);
  }, []);

  // ================= SOCKET CONNECTION =================
  useEffect(() => {
    if (!user) return;

    console.log("🔌 Connecting socket for user:", user.id);
    socket.emit("join", user.id);

    socket.on("connect", () => {
      console.log("✅ Socket connected");
      setConnectionStatus("connected");
    });
    
    socket.on("disconnect", () => {
      console.log("❌ Socket disconnected");
      setConnectionStatus("disconnected");
      if (isCallActive) endCall();
    });
    
    socket.on("reconnect", () => {
      console.log("🔄 Socket reconnected");
      setConnectionStatus("connected");
      socket.emit("join", user.id);
    });

    socket.on("receiveMessage", (data) => {
      console.log("📩 Message received:", data);
      
      if (data.receiverId === user.id) {
        const newMsg = {
          id: data.id || Date.now(),
          text: data.message || '',
          sender: "other",
          fileUrl: data.fileUrl,
          fileType: data.fileType,
          fileName: data.fileName,
          analysis: data.analysis,
          time: formatMessageTime(new Date()),
          status: 'delivered',
          isNew: true
        };

        setMessagesByChat((prev) => {
          const chatMessages = prev[data.senderId] || [];
          return { ...prev, [data.senderId]: [...chatMessages, newMsg] };
        });

        if (selectedChat?.id === data.senderId) {
          setMessages((prev) => [...prev, newMsg]);
        }

        setAllUsers(prev => 
          prev.map(u => 
            u.id === data.senderId 
              ? { 
                  ...u, 
                  lastMessage: data.message || (data.fileName ? '📎 Media' : ''),
                  lastMessageTime: new Date().toISOString(),
                  unreadCount: (u.unreadCount || 0) + 1
                }
              : u
          )
        );
      }
    });

    socket.on("messageSent", (data) => {
      console.log("✅ Message sent:", data);
    });

    socket.on("userTyping", ({ userId, isTyping }) => {
      if (selectedChat?.id === userId) {
        setIsTyping(isTyping);
      }
    });

    socket.on("userOnline", ({ userId, isOnline }) => {
      console.log(`👤 User ${userId} is ${isOnline ? 'online' : 'offline'}`);
      setAllUsers(prev =>
        prev.map(u => u.id === userId ? { ...u, is_online: isOnline } : u)
      );
    });

    // ================= CALL EVENT HANDLERS =================
    socket.on("incomingCall", (data) => {
      console.log("📞 Incoming call from:", data.fromName);
      setIncomingCall({
        from: data.from,
        fromName: data.fromName,
        type: data.type,
        offer: data.offer
      });
    });

    socket.on("callAccepted", async (data) => {
      console.log("📞 Call accepted by receiver");
      if (outgoingCall && peerConnection) {
        try {
          await peerConnection.setRemoteDescription(new RTCSessionDescription(data.answer));
          setActiveCall(outgoingCall);
          setOutgoingCall(null);
          setIsCallActive(true);
          setIsCallConnecting(false);
          startCallTimer();
          showToast("Call connected", "success");
        } catch (err) {
          console.error("Error setting remote description:", err);
        }
      }
    });

    socket.on("callRejected", (data) => {
      console.log("📞 Call rejected");
      setOutgoingCall(null);
      setIsCallActive(false);
      setShowCallWindow(false);
      setIsCallConnecting(false);
      showToast(`${data.fromName} rejected the call`, "info");
      cleanupCall();
    });

    socket.on("callEnded", () => {
      console.log("📞 Call ended by other party");
      showToast("Call ended", "info");
      endCall();
    });

    socket.on("iceCandidate", async (data) => {
      console.log("📞 ICE candidate received");
      if (peerConnection) {
        try {
          await peerConnection.addIceCandidate(new RTCIceCandidate(data.candidate));
        } catch (e) {
          console.error("Error adding ICE candidate:", e);
        }
      }
    });

    socket.on("callMissed", (data) => {
      console.log("📞 Call missed");
      showToast(`Missed call from ${data.fromName}`, "info");
    });

    socket.on("callFailed", (data) => {
      console.log("📞 Call failed:", data.reason);
      showToast(`Call failed: ${data.reason}`, "warning");
      setOutgoingCall(null);
      setIsCallConnecting(false);
      setShowCallWindow(false);
    });

    const handleClickOutside = (event) => {
      if (attachMenuRef.current && !attachMenuRef.current.contains(event.target)) {
        setShowAttachMenu(false);
        setShowDeviceMenu(false);
      }
    };
    
    document.addEventListener("mousedown", handleClickOutside);
    
    return () => {
      socket.off("receiveMessage");
      socket.off("userTyping");
      socket.off("userOnline");
      socket.off("messageSent");
      socket.off("connect");
      socket.off("disconnect");
      socket.off("incomingCall");
      socket.off("callAccepted");
      socket.off("callRejected");
      socket.off("callEnded");
      socket.off("iceCandidate");
      socket.off("callMissed");
      socket.off("callFailed");
      document.removeEventListener("mousedown", handleClickOutside);
      if (isCallActive) endCall();
    };
  }, [user, selectedChat, formatMessageTime, showToast, startCallTimer, endCall, cleanupCall, isCallActive, outgoingCall, peerConnection]);

  /* ================= AUTO SCROLL ================= */
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  /* ================= FETCH ALL USERS ================= */
  useEffect(() => {
    const fetchAllUsers = async () => {
      try {
        setLoading(true);
        const res = await fetch(
          `http://localhost:5000/api/users/all/${user.id}`
        );
        const data = await res.json();
        
        if (data.success) {
          const usersWithPreview = await Promise.all(
            data.users.map(async (u) => {
              try {
                const lastMsgRes = await fetch(
                  `http://localhost:5000/api/messages/last/${user.id}/${u.id}`
                );
                const lastMsgData = await lastMsgRes.json();
                return { 
                  ...u, 
                  lastMessage: lastMsgData.lastMessage || "Click to start chatting",
                  lastMessageTime: lastMsgData.timestamp,
                  unreadCount: 0
                };
              } catch (err) {
                return { 
                  ...u, 
                  lastMessage: "Click to start chatting",
                  lastMessageTime: null,
                  unreadCount: 0
                };
              }
            })
          );
          
          setAllUsers(usersWithPreview);
        }
      } catch (err) {
        console.error("Error fetching users:", err);
      } finally {
        setLoading(false);
      }
    };

    if (user?.id) {
      fetchAllUsers();
      const interval = setInterval(fetchAllUsers, 10000);
      return () => clearInterval(interval);
    }
  }, [user?.id]);

  /* ================= FETCH CHAT HISTORY ================= */
  const fetchMessages = async (receiverId) => {
    try {
      const res = await fetch(
        `http://localhost:5000/api/messages/${user.id}/${receiverId}`
      );
      const data = await res.json();

      const formatted = data.messages.map((msg) => ({
        id: msg.id,
        text: msg.message,
        sender: msg.sender_id === user.id ? "me" : "other",
        fileUrl: msg.file_url,
        fileType: msg.file_type,
        fileName: msg.file_name,
        analysis: msg.analysis_result ? JSON.parse(msg.analysis_result) : null,
        time: formatMessageTime(new Date(msg.created_at)),
        status: msg.sender_id === user.id ? 'read' : 'delivered',
        isNew: false
      }));

      setMessages(formatted);
      setMessagesByChat((prev) => ({ ...prev, [receiverId]: formatted }));
      
      setAllUsers(prev =>
        prev.map(u =>
          u.id === receiverId ? { ...u, unreadCount: 0 } : u
        )
      );
    } catch (err) {
      console.error("Error fetching messages:", err);
    }
  };

  /* ================= CREATE NEW CHAT ================= */
  const createNewChat = async (receiverId) => {
    try {
      await fetch('http://localhost:5000/api/chats/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId1: user.id,
          userId2: receiverId
        })
      });
    } catch (err) {
      console.error("Error creating chat:", err);
    }
  };

  /* ================= TYPING HANDLER ================= */
  const handleTyping = (e) => {
    setInput(e.target.value);

    if (!selectedChat) return;

    socket.emit("typing", {
      senderId: user.id,
      receiverId: selectedChat.id,
      isTyping: true,
    });

    clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(() => {
      socket.emit("typing", {
        senderId: user.id,
        receiverId: selectedChat.id,
        isTyping: false,
      });
    }, 1000);
  };

  /* ================= CALL FUNCTIONS ================= */
  const startCall = async (type) => {
    if (!selectedChat) {
      showToast("Please select a contact to call", "warning");
      return;
    }

    if (!selectedChat.is_online) {
      showToast(`${selectedChat.username} is offline`, "warning");
      return;
    }

    try {
      setIsCallConnecting(true);
      setCallType(type);
      
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: type === 'video'
      });

      setLocalStream(stream);
      
      // Set local video
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = stream;
      }

      const pc = new RTCPeerConnection(configuration);
      setPeerConnection(pc);

      // Add local stream to peer connection
      stream.getTracks().forEach(track => {
        pc.addTrack(track, stream);
      });

      // Handle ICE candidates
      pc.onicecandidate = (event) => {
        if (event.candidate) {
          console.log("📞 Sending ICE candidate");
          socket.emit("iceCandidate", {
            targetId: selectedChat.id,
            candidate: event.candidate
          });
        }
      };

      // Handle ICE connection state
      pc.oniceconnectionstatechange = () => {
        console.log("ICE connection state:", pc.iceConnectionState);
      };

      // Handle connection state
      pc.onconnectionstatechange = () => {
        console.log("Connection state:", pc.connectionState);
        if (pc.connectionState === 'connected') {
          setIsCallConnecting(false);
          setIsCallActive(true);
          showToast("Call connected", "success");
        } else if (pc.connectionState === 'failed' || pc.connectionState === 'disconnected') {
          endCall();
        }
      };

      // Handle remote stream
      pc.ontrack = (event) => {
        console.log("📞 Remote stream received");
        const [remoteStream] = event.streams;
        setRemoteStream(remoteStream);
        
        // Set remote video
        if (remoteVideoRef.current) {
          remoteVideoRef.current.srcObject = remoteStream;
        }
      };

      // Create offer
      const offer = await pc.createOffer({
        offerToReceiveAudio: true,
        offerToReceiveVideo: type === 'video'
      });
      await pc.setLocalDescription(offer);

      console.log("📞 Sending offer to", selectedChat.username);
      socket.emit("startCall", {
        targetId: selectedChat.id,
        from: user.id,
        fromName: user.username,
        type: type,
        offer: offer
      });

      setOutgoingCall({
        to: selectedChat.id,
        toName: selectedChat.username,
        type: type
      });

      setShowCallWindow(true);
      
      showToast(`Calling ${selectedChat.username}...`, "info");

    } catch (err) {
      console.error("Error starting call:", err);
      showToast("Failed to start call. Please check permissions.", "warning");
      setIsCallConnecting(false);
      setShowCallWindow(false);
    }
  };

  const acceptCall = async () => {
    if (!incomingCall) return;

    try {
      console.log("📞 Accepting call from", incomingCall.fromName);
      setCallType(incomingCall.type);
      
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: incomingCall.type === 'video'
      });

      setLocalStream(stream);
      
      // Set local video
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = stream;
      }

      const pc = new RTCPeerConnection(configuration);
      setPeerConnection(pc);

      // Add local stream to peer connection
      stream.getTracks().forEach(track => {
        pc.addTrack(track, stream);
      });

      // Handle ICE candidates
      pc.onicecandidate = (event) => {
        if (event.candidate) {
          console.log("📞 Sending ICE candidate");
          socket.emit("iceCandidate", {
            targetId: incomingCall.from,
            candidate: event.candidate
          });
        }
      };

      // Handle ICE connection state
      pc.oniceconnectionstatechange = () => {
        console.log("ICE connection state:", pc.iceConnectionState);
        if (pc.iceConnectionState === 'connected') {
          setIsCallActive(true);
        }
      };

      // Handle connection state
      pc.onconnectionstatechange = () => {
        console.log("Connection state:", pc.connectionState);
        if (pc.connectionState === 'connected') {
          setIsCallActive(true);
          showToast("Call connected", "success");
        }
      };

      // Handle remote stream
      pc.ontrack = (event) => {
        console.log("📞 Remote stream received");
        const [remoteStream] = event.streams;
        setRemoteStream(remoteStream);
        
        // Set remote video
        if (remoteVideoRef.current) {
          remoteVideoRef.current.srcObject = remoteStream;
        }
      };

      // Set remote description
      await pc.setRemoteDescription(new RTCSessionDescription(incomingCall.offer));
      console.log("✅ Remote description set");

      // Create answer
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      console.log("✅ Local description set");

      // Send answer
      socket.emit("acceptCall", {
        targetId: incomingCall.from,
        answer: answer
      });

      setActiveCall({
        with: incomingCall.from,
        withName: incomingCall.fromName,
        type: incomingCall.type
      });
      setIncomingCall(null);
      setShowCallWindow(true);
      startCallTimer();

    } catch (err) {
      console.error("Error accepting call:", err);
      showToast("Failed to accept call", "warning");
    }
  };

  const rejectCall = () => {
    if (incomingCall) {
      socket.emit("rejectCall", {
        targetId: incomingCall.from,
        fromName: user.username
      });
      setIncomingCall(null);
      showToast("Call rejected", "info");
    }
  };

  const toggleMute = () => {
    if (localStream) {
      const audioTrack = localStream.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.enabled = !audioTrack.enabled;
        setIsMuted(!audioTrack.enabled);
        showToast(audioTrack.enabled ? "Unmuted" : "Muted", "info");
      }
    }
  };

  const toggleVideo = () => {
    if (localStream && callType === 'video') {
      const videoTrack = localStream.getVideoTracks()[0];
      if (videoTrack) {
        videoTrack.enabled = !videoTrack.enabled;
        setIsVideoOff(!videoTrack.enabled);
        showToast(videoTrack.enabled ? "Video on" : "Video off", "info");
      }
    }
  };

  const formatCallDuration = (seconds) => {
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    
    if (hrs > 0) {
      return `${hrs}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  /* ================= VOICE RECORDING FUNCTIONS ================= */
  const checkMicrophonePermission = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      setRecordingPermission(true);
      
      const devices = await navigator.mediaDevices.enumerateDevices();
      const audioInputs = devices.filter(device => device.kind === 'audioinput');
      setAudioDevices(audioInputs);
      
      if (audioInputs.length > 0) {
        setSelectedDevice(audioInputs[0].deviceId);
      }
      
      stream.getTracks().forEach(track => track.stop());
      
      return true;
    } catch (err) {
      console.error("Microphone permission denied:", err);
      setRecordingPermission(false);
      showToast("Please allow microphone access to record voice", "warning");
      return false;
    }
  };

  const startRecording = async () => {
    if (!selectedChat) {
      showToast("Please select a chat first", "info");
      return;
    }

    try {
      const hasPermission = await checkMicrophonePermission();
      if (!hasPermission) return;

      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          deviceId: selectedDevice ? { exact: selectedDevice } : undefined,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        } 
      });

      mediaRecorderRef.current = new MediaRecorder(stream);
      audioChunksRef.current = [];

      mediaRecorderRef.current.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorderRef.current.onstop = () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        const audioUrl = URL.createObjectURL(audioBlob);
        setAudioBlob(audioBlob);
        setAudioUrl(audioUrl);
        
        stream.getTracks().forEach(track => track.stop());
      };

      mediaRecorderRef.current.start();
      setIsRecording(true);
      setRecordingTime(0);
      
      recordingTimerRef.current = setInterval(() => {
        setRecordingTime(prev => prev + 1);
      }, 1000);

      showToast("Recording started...", "info");

    } catch (err) {
      console.error("Error starting recording:", err);
      showToast("Failed to start recording", "warning");
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      clearInterval(recordingTimerRef.current);
      showToast("Recording finished", "success");
    }
  };

  const cancelRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      clearInterval(recordingTimerRef.current);
      setAudioBlob(null);
      setAudioUrl(null);
      showToast("Recording cancelled", "info");
    }
  };

  const sendVoiceMessage = async () => {
    if (!selectedChat || !audioBlob) return;

    const tempId = Date.now();
    const currentTime = new Date();

    const tempMessage = {
      id: tempId,
      text: '',
      sender: "me",
      fileUrl: audioUrl,
      fileType: 'audio/webm',
      fileName: `voice_message_${formatRecordingTime(recordingTime)}.webm`,
      time: formatMessageTime(currentTime),
      status: 'sending',
      analysis: null
    };

    setMessages((prev) => [...prev, tempMessage]);
    setMessagesByChat((prev) => ({
      ...prev,
      [selectedChat.id]: [...(prev[selectedChat.id] || []), tempMessage]
    }));

    setAllUsers(prev =>
      prev.map(u =>
        u.id === selectedChat.id
          ? { ...u, lastMessage: '🎤 Voice message', lastMessageTime: new Date().toISOString() }
          : u
      )
    );

    try {
      setIsUploading(true);
      const formData = new FormData();
      
      const audioFile = new File([audioBlob], `voice_message_${Date.now()}.webm`, { type: 'audio/webm' });
      formData.append("file", audioFile);
      formData.append("senderId", user.id);
      formData.append("receiverId", selectedChat.id);

      const progressInterval = setInterval(() => {
        setUploadProgress((prev) => {
          if (prev >= 90) {
            clearInterval(progressInterval);
            return 90;
          }
          return prev + 10;
        });
      }, 200);

      const res = await fetch("http://localhost:5000/api/analyze-media", {
        method: "POST",
        body: formData,
      });

      clearInterval(progressInterval);
      setUploadProgress(100);

      const data = await res.json();

      if (data.success) {
        const updatedMessage = {
          ...tempMessage,
          status: 'analyzed',
          fileUrl: data.message.fileUrl,
          analysis: data.analysis,
          id: data.message.id
        };

        setMessages((prev) =>
          prev.map((msg) => (msg.id === tempId ? updatedMessage : msg))
        );

        setMessagesByChat((prev) => ({
          ...prev,
          [selectedChat.id]: prev[selectedChat.id].map((msg) =>
            msg.id === tempId ? updatedMessage : msg
          )
        }));

        socket.emit("sendMessage", {
          id: data.message.id,
          senderId: user.id,
          senderName: user.username,
          receiverId: selectedChat.id,
          message: "",
          fileUrl: data.message.fileUrl,
          fileType: 'audio/webm',
          fileName: audioFile.name,
          analysis: data.analysis
        });

        if (data.analysis) {
          const isDeepfake = data.analysis.audio_analysis?.fake_prob > 50;
          if (isDeepfake) {
            showToast("⚠️ Deepfake detected in voice message!", "warning");
          }
        }
      }

      if (audioUrl) URL.revokeObjectURL(audioUrl);
      setAudioBlob(null);
      setAudioUrl(null);

      setTimeout(() => {
        setUploadProgress(0);
        setIsUploading(false);
      }, 500);

    } catch (err) {
      console.error("❌ Voice message upload failed:", err);
      
      setMessages((prev) =>
        prev.map((msg) =>
          msg.id === tempId ? { ...msg, status: 'failed' } : msg
        )
      );
      
      setIsUploading(false);
      setUploadProgress(0);
    }
  };

  /* ================= SEND TEXT MESSAGE ================= */
  const sendTextMessage = async () => {
    if (!selectedChat || !input.trim()) return;

    const tempId = Date.now();
    const currentTime = new Date();

    const tempMessage = {
      id: tempId,
      text: input,
      sender: "me",
      fileUrl: null,
      fileType: null,
      fileName: null,
      time: formatMessageTime(currentTime),
      status: 'sending',
      analysis: null
    };

    setMessages((prev) => [...prev, tempMessage]);
    setMessagesByChat((prev) => ({
      ...prev,
      [selectedChat.id]: [...(prev[selectedChat.id] || []), tempMessage]
    }));

    try {
      socket.emit("sendMessage", {
        id: tempId,
        senderId: user.id,
        senderName: user.username,
        receiverId: selectedChat.id,
        message: input,
        fileUrl: null,
        fileType: null,
        fileName: null,
        analysis: null
      });

      const updatedMessage = { ...tempMessage, status: 'sent' };
      setMessages((prev) =>
        prev.map((msg) => (msg.id === tempId ? updatedMessage : msg))
      );

      setMessagesByChat((prev) => ({
        ...prev,
        [selectedChat.id]: prev[selectedChat.id].map((msg) =>
          msg.id === tempId ? updatedMessage : msg
        )
      }));

      setAllUsers(prev =>
        prev.map(u =>
          u.id === selectedChat.id
            ? { ...u, lastMessage: input, lastMessageTime: new Date().toISOString() }
            : u
        )
      );

      setInput("");
    } catch (err) {
      console.error("Send message failed:", err);
      
      setMessages((prev) =>
        prev.map((msg) =>
          msg.id === tempId ? { ...msg, status: 'failed' } : msg
        )
      );
    }
  };

  /* ================= SEND MEDIA WITH DEEPFAKE ANALYSIS ================= */
  const sendMediaMessage = async () => {
    if (!selectedChat || !selectedFile) return;

    const tempId = Date.now();
    const currentTime = new Date();

    const tempMessage = {
      id: tempId,
      text: '',
      sender: "me",
      fileUrl: URL.createObjectURL(selectedFile),
      fileType: selectedFile.type,
      fileName: selectedFile.name,
      time: formatMessageTime(currentTime),
      status: 'analyzing',
      analysis: null
    };

    setMessages((prev) => [...prev, tempMessage]);
    setMessagesByChat((prev) => ({
      ...prev,
      [selectedChat.id]: [...(prev[selectedChat.id] || []), tempMessage]
    }));

    setAllUsers(prev =>
      prev.map(u =>
        u.id === selectedChat.id
          ? { ...u, lastMessage: '📎 Media', lastMessageTime: new Date().toISOString() }
          : u
      )
    );

    try {
      setIsUploading(true);
      const formData = new FormData();
      formData.append("file", selectedFile);
      formData.append("senderId", user.id);
      formData.append("receiverId", selectedChat.id);

      const progressInterval = setInterval(() => {
        setUploadProgress((prev) => {
          if (prev >= 90) {
            clearInterval(progressInterval);
            return 90;
          }
          return prev + 10;
        });
      }, 200);

      const res = await fetch("http://localhost:5000/api/analyze-media", {
        method: "POST",
        body: formData,
      });

      clearInterval(progressInterval);
      setUploadProgress(100);

      const data = await res.json();

      if (data.success) {
        const updatedMessage = {
          ...tempMessage,
          status: 'analyzed',
          fileUrl: data.message.fileUrl,
          analysis: data.analysis,
          id: data.message.id
        };

        setMessages((prev) =>
          prev.map((msg) => (msg.id === tempId ? updatedMessage : msg))
        );

        setMessagesByChat((prev) => ({
          ...prev,
          [selectedChat.id]: prev[selectedChat.id].map((msg) =>
            msg.id === tempId ? updatedMessage : msg
          )
        }));
        
        socket.emit("sendMessage", {
          id: data.message.id,
          senderId: user.id,
          senderName: user.username,
          receiverId: selectedChat.id,
          message: "",
          fileUrl: data.message.fileUrl,
          fileType: selectedFile.type,
          fileName: selectedFile.name,
          analysis: data.analysis
        });

        if (data.analysis) {
          const isDeepfake = 
            (data.analysis.video_analysis?.score > 50) ||
            (data.analysis.audio_analysis?.fake_prob > 50);
          
          if (isDeepfake) {
            showToast("⚠️ Deepfake detected in media!", "warning");
          }
        }
      }

      URL.revokeObjectURL(tempMessage.fileUrl);
      setSelectedFile(null);
      if (fileInputRef.current) fileInputRef.current.value = "";

      setTimeout(() => {
        setUploadProgress(0);
        setIsUploading(false);
      }, 500);

    } catch (err) {
      console.error("❌ Media upload failed:", err);
      
      setMessages((prev) =>
        prev.map((msg) =>
          msg.id === tempId ? { ...msg, status: 'failed' } : msg
        )
      );
      
      setIsUploading(false);
      setUploadProgress(0);
    }
  };

  /* ================= HANDLE SEND ================= */
  const handleSend = () => {
    if (audioBlob) {
      sendVoiceMessage();
    } else if (selectedFile) {
      sendMediaMessage();
    } else if (input.trim()) {
      sendTextMessage();
    }
  };

  /* ================= HANDLE KEY PRESS ================= */
  const handleKeyPress = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  /* ================= HANDLE FILE SELECT ================= */
  const handleFileSelect = (e) => {
    const file = e.target.files[0];
    if (file) {
      setSelectedFile(file);
      setShowAttachMenu(false);
      setTimeout(() => sendMediaMessage(), 100);
    }
  };

  /* ================= LOGOUT FUNCTION ================= */
  const handleLogout = async () => {
    try {
      setShowLogoutConfirm(false);
      showToast("Logging out...", "info");
      
      if (isCallActive) endCall();
      
      await fetch("http://localhost:5000/api/logout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: user.id,
        }),
      });

      localStorage.removeItem("user");
      localStorage.removeItem("token");
      localStorage.removeItem("deviceId");
      
      socket.disconnect();
      
      setUser(null);
      
      showToast("Logged out successfully", "success");
    } catch (err) {
      console.error("Logout failed", err);
      showToast("Logout failed", "warning");
    }
  };

  /* ================= RENDER FILE WITH ANALYSIS ================= */
  const renderFileWithAnalysis = (fileUrl, fileType, fileName, analysis, status) => {
    if (!fileUrl) return null;

    const isImage = fileType?.startsWith('image/') || 
                   fileName?.match(/\.(jpeg|jpg|png|gif|webp|bmp)$/i) ||
                   fileUrl.match(/\.(jpeg|jpg|png|gif|webp|bmp)(\?.*)?$/i);
    
    const isVideo = fileType?.startsWith('video/') || 
                   fileName?.match(/\.(mp4|webm|ogg|mov|avi|mkv)$/i) ||
                   fileUrl.match(/\.(mp4|webm|ogg|mov|avi|mkv)(\?.*)?$/i);
    
    const isAudio = fileType?.startsWith('audio/') || 
                   fileName?.match(/\.(mp3|wav|ogg|m4a|aac)$/i) ||
                   fileUrl.match(/\.(mp3|wav|ogg|m4a|aac)(\?.*)?$/i);

    if (status === 'analyzing') {
      return (
        <div className="media-container analyzing">
          <div className="analyzing-overlay">
            <div className="spinner"></div>
            <p>🔬 Analyzing...</p>
          </div>
          {isImage && <img src={fileUrl} alt={fileName} />}
          {isVideo && <video src={fileUrl} controls />}
          {isAudio && <audio src={fileUrl} controls />}
        </div>
      );
    }

    const isDeepfake = analysis ? (
      (analysis.video_analysis?.score > 50) ||
      (analysis.audio_analysis?.fake_prob > 50)
    ) : false;

    const renderAnalysisBadge = () => {
      if (!analysis) return null;

      return (
        <div 
          className={`analysis-badge ${isDeepfake ? 'deepfake' : 'real'}`}
          onClick={() => setSelectedAnalysis(analysis)}
        >
          {isDeepfake ? '⚠️' : '✅'}
          <div className="analysis-tooltip">
            <h4>Deepfake Analysis</h4>
            {analysis.video_analysis && (
              <div className="analysis-item">
                <span>Video: {analysis.video_analysis.score}%</span>
                <span className={analysis.video_analysis.score > 50 ? 'text-danger' : 'text-safe'}>
                  {analysis.video_analysis.verdict}
                </span>
              </div>
            )}
            {analysis.audio_analysis && (
              <div className="analysis-item">
                <span>Audio: {analysis.audio_analysis.fake_prob}%</span>
                <span className={analysis.audio_analysis.fake_prob > 50 ? 'text-danger' : 'text-safe'}>
                  {analysis.audio_analysis.verdict}
                </span>
              </div>
            )}
          </div>
        </div>
      );
    };

    return (
      <div className="media-container">
        {renderAnalysisBadge()}
        {isImage && (
          <img 
            src={fileUrl} 
            alt={fileName} 
            onClick={() => setShowMediaView(fileUrl)}
            className={isDeepfake ? 'deepfake-border' : ''}
          />
        )}
        {isVideo && (
          <video controls className={isDeepfake ? 'deepfake-border' : ''}>
            <source src={fileUrl} type={fileType || 'video/mp4'} />
          </video>
        )}
        {isAudio && (
          <audio controls src={fileUrl} className={isDeepfake ? 'deepfake-border' : ''} />
        )}
      </div>
    );
  };

  /* ================= FILTER USERS ================= */
  const filteredUsers = allUsers.filter(u =>
    u.username?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  /* ================= UI ================= */
  return (
    <div className="home-container">
      
      {/* Connection Status Banner */}
      {connectionStatus !== "connected" && (
        <div className={`connection-banner ${connectionStatus}`}>
          <div className="connection-content">
            <span className="connection-icon">
              {connectionStatus === "disconnected" ? "🔴" : "🟡"}
            </span>
            <span className="connection-text">
              {connectionStatus === "disconnected" 
                ? "Reconnecting..." 
                : "Connection lost. Trying to reconnect..."}
            </span>
          </div>
        </div>
      )}

      {/* Incoming Call Modal */}
      {incomingCall && (
        <div className="modal-overlay">
          <div className="incoming-call-modal">
            <div className="call-avatar">
              {incomingCall.fromName?.charAt(0).toUpperCase()}
            </div>
            <h3>{incomingCall.fromName}</h3>
            <p className="call-type">
              {incomingCall.type === 'video' ? '📹 Video Call' : '🎤 Audio Call'}
            </p>
            <div className="call-actions">
              <button className="accept-call-btn" onClick={acceptCall}>
                Accept
              </button>
              <button className="reject-call-btn" onClick={rejectCall}>
                Reject
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Call Window */}
      {showCallWindow && (
        <div className="call-window">
          <div className="call-header">
            <div className="call-info">
              <h3>{activeCall?.withName || outgoingCall?.toName || "Connecting..."}</h3>
              {isCallActive ? (
                <p>{formatCallDuration(callDuration)}</p>
              ) : (
                <p>{isCallConnecting ? "Connecting..." : "Ringing..."}</p>
              )}
            </div>
            <button className="close-call-btn" onClick={endCall}>✕</button>
          </div>
          
          <div className="call-videos">
            {callType === 'video' && (
              <>
                <video 
                  ref={remoteVideoRef} 
                  className="remote-video" 
                  autoPlay 
                  playsInline
                />
                <video 
                  ref={localVideoRef} 
                  className="local-video" 
                  autoPlay 
                  playsInline 
                  muted
                />
              </>
            )}
            {callType === 'audio' && (
              <div className="audio-call-ui">
                <div className="audio-call-avatar">
                  {activeCall?.withName?.charAt(0).toUpperCase() || outgoingCall?.toName?.charAt(0).toUpperCase()}
                </div>
                <p className="audio-call-label">
                  {isCallActive ? "Audio Call" : (isCallConnecting ? "Connecting..." : "Ringing...")}
                </p>
                {isCallActive && (
                  <div className="sound-wave">
                    <span></span>
                    <span></span>
                    <span></span>
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="call-controls">
            <button 
              className={`call-control-btn ${isMuted ? 'active' : ''}`}
              onClick={toggleMute}
            >
              {isMuted ? '🔇' : '🎤'}
            </button>
            {callType === 'video' && (
              <button 
                className={`call-control-btn ${isVideoOff ? 'active' : ''}`}
                onClick={toggleVideo}
              >
                {isVideoOff ? '📹❌' : '📹'}
              </button>
            )}
            <button className="call-control-btn end-call" onClick={endCall}>
              📞
            </button>
          </div>
        </div>
      )}

      {/* Logout Confirmation Modal */}
      {showLogoutConfirm && (
        <div className="modal-overlay" onClick={() => setShowLogoutConfirm(false)}>
          <div className="logout-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Logout</h3>
              <button className="close-btn" onClick={() => setShowLogoutConfirm(false)}>×</button>
            </div>
            <div className="modal-body">
              <p>Are you sure you want to logout?</p>
              <p className="logout-warning">You will be redirected to the login page.</p>
            </div>
            <div className="modal-footer">
              <button 
                className="cancel-btn" 
                onClick={() => setShowLogoutConfirm(false)}
              >
                Cancel
              </button>
              <button 
                className="logout-confirm-btn" 
                onClick={handleLogout}
              >
                Logout
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Analysis Modal */}
      {selectedAnalysis && (
        <div className="modal-overlay" onClick={() => setSelectedAnalysis(null)}>
          <div className="analysis-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Deepfake Analysis Results</h3>
              <button className="close-btn" onClick={() => setSelectedAnalysis(null)}>×</button>
            </div>
            <div className="modal-body">
              {selectedAnalysis.video_analysis && (
                <div className="analysis-section">
                  <h4>Video Analysis</h4>
                  <div className="analysis-grid">
                    <div className="analysis-item">
                      <span className="label">Score:</span>
                      <span className={`value ${selectedAnalysis.video_analysis.score > 50 ? 'danger' : 'safe'}`}>
                        {selectedAnalysis.video_analysis.score}%
                      </span>
                    </div>
                    <div className="analysis-item">
                      <span className="label">Verdict:</span>
                      <span className={`value ${selectedAnalysis.video_analysis.score > 50 ? 'danger' : 'safe'}`}>
                        {selectedAnalysis.video_analysis.verdict}
                      </span>
                    </div>
                    <div className="analysis-item">
                      <span className="label">Confidence:</span>
                      <span className="value">{selectedAnalysis.video_analysis.confidence}%</span>
                    </div>
                    <div className="analysis-item">
                      <span className="label">Faces:</span>
                      <span className="value">{selectedAnalysis.video_analysis.faces_detected}</span>
                    </div>
                  </div>
                </div>
              )}
              
              {selectedAnalysis.audio_analysis && (
                <div className="analysis-section">
                  <h4>Audio Analysis</h4>
                  <div className="analysis-grid">
                    <div className="analysis-item">
                      <span className="label">Fake:</span>
                      <span className={`value ${selectedAnalysis.audio_analysis.fake_prob > 50 ? 'danger' : 'safe'}`}>
                        {selectedAnalysis.audio_analysis.fake_prob}%
                      </span>
                    </div>
                    <div className="analysis-item">
                      <span className="label">Real:</span>
                      <span className={`value ${selectedAnalysis.audio_analysis.real_prob > 50 ? 'safe' : 'danger'}`}>
                        {selectedAnalysis.audio_analysis.real_prob}%
                      </span>
                    </div>
                    <div className="analysis-item">
                      <span className="label">Verdict:</span>
                      <span className={`value ${selectedAnalysis.audio_analysis.fake_prob > 50 ? 'danger' : 'safe'}`}>
                        {selectedAnalysis.audio_analysis.verdict}
                      </span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Media Viewer Modal */}
      {showMediaView && (
        <div className="modal-overlay" onClick={() => setShowMediaView(null)}>
          <div className="media-viewer" onClick={(e) => e.stopPropagation()}>
            <button className="close-btn" onClick={() => setShowMediaView(null)}>×</button>
            <img src={showMediaView} alt="Media viewer" className="media-full" />
          </div>
        </div>
      )}

      {/* Profile View Modal */}
      {showProfileView && user && (
        <div className="modal-overlay" onClick={() => setShowProfileView(false)}>
          <div className="profile-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Profile</h3>
              <button className="close-btn" onClick={() => setShowProfileView(false)}>×</button>
            </div>
            <div className="profile-content">
              <div className="profile-avatar-large">
                {user.username?.charAt(0).toUpperCase()}
              </div>
              <div className="profile-details">
                <div className="profile-field">
                  <label>Username</label>
                  <span>{user.username}</span>
                </div>
                <div className="profile-field">
                  <label>Email</label>
                  <span>{user.email}</span>
                </div>
                <div className="profile-field">
                  <label>Status</label>
                  <span>Online</span>
                </div>
              </div>
              <button 
                className="logout-btn-large" 
                onClick={() => setShowLogoutConfirm(true)}
              >
                ⏻ Logout
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Sidebar */}
      <div className="sidebar">
        <div className="profile-header">
          <div className="profile-section" onClick={() => setShowProfileView(true)}>
            <div className="profile-avatar">
              {user?.username?.charAt(0).toUpperCase()}
              <span className="online-indicator"></span>
            </div>
            <div className="profile-info">
              <h3>{user?.username}</h3>
              <p className="profile-status">Online</p>
            </div>
          </div>
          <div className="profile-actions">
            <button className="action-btn" title="Status">
              <span>📷</span>
            </button>
            <button className="action-btn" title="New Chat">
              <span>💬</span>
            </button>
            <button 
              className="action-btn" 
              title="Logout"
              onClick={() => setShowLogoutConfirm(true)}
            >
              <span>⏻</span>
            </button>
          </div>
        </div>

        <div className="search-section">
          <div className="search-box">
            <span className="search-icon">🔍</span>
            <input
              type="text"
              placeholder="Search or start new chat"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
            {searchTerm && (
              <button className="clear-search" onClick={() => setSearchTerm('')}>
                ✕
              </button>
            )}
          </div>
        </div>

        <div className="tabs">
          <button className={`tab ${!searchTerm ? 'active' : ''}`}>Chats</button>
        </div>

        <div className="contact-list">
          {loading ? (
            <div className="loading-state">
              <div className="spinner"></div>
              <p>Loading chats...</p>
            </div>
          ) : filteredUsers.length === 0 ? (
            <div className="empty-state">
              <div className="empty-icon">💬</div>
              <h4>No chats yet</h4>
              <p>Start a conversation by searching for users</p>
            </div>
          ) : (
            filteredUsers.map((u) => {
              const unreadCount = u.unreadCount || 0;
              return (
                <div
                  key={u.id}
                  className={`chat-item ${selectedChat?.id === u.id ? 'active' : ''} ${unreadCount > 0 ? 'unread' : ''}`}
                  onClick={() => {
                    setSelectedChat(u);
                    createNewChat(u.id);
                    if (messagesByChat[u.id]) {
                      setMessages(messagesByChat[u.id]);
                    } else {
                      fetchMessages(u.id);
                    }
                  }}
                >
                  <div className="chat-avatar">
                    {u.username?.charAt(0).toUpperCase()}
                    {u.is_online && <span className="online-dot"></span>}
                  </div>
                  <div className="chat-details">
                    <div className="chat-header">
                      <span className="chat-name">{u.username}</span>
                      {u.lastMessageTime && (
                        <span className="chat-time">{formatChatTime(u.lastMessageTime)}</span>
                      )}
                    </div>
                    <div className="chat-preview">
                      <span className="preview-text">
                        {u.lastMessage || "Click to start chatting"}
                      </span>
                      {unreadCount > 0 && (
                        <span className="unread-badge">{unreadCount}</span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Chat Section */}
      <div className="chat-section">
        {selectedChat ? (
          <>
            <div className="chat-header">
              <div className="chat-header-left">
                <div className="chat-avatar">
                  {selectedChat.username?.charAt(0).toUpperCase()}
                  {selectedChat.is_online && <span className="online-indicator"></span>}
                </div>
                <div className="chat-info">
                  <h3>{selectedChat.username}</h3>
                  <p className="chat-status">
                    {isTyping ? (
                      <span className="typing-text">typing...</span>
                    ) : (
                      <span className={selectedChat.is_online ? 'online' : 'offline'}>
                        {selectedChat.is_online ? 'online' : 'offline'}
                      </span>
                    )}
                  </p>
                </div>
              </div>
              <div className="chat-header-actions">
                <button 
                  className="action-btn" 
                  title="Audio Call"
                  onClick={() => startCall('audio')}
                  disabled={!selectedChat.is_online || isCallActive}
                >
                  <span>🎤</span>
                </button>
                <button 
                  className="action-btn" 
                  title="Video Call"
                  onClick={() => startCall('video')}
                  disabled={!selectedChat.is_online || isCallActive}
                >
                  <span>📹</span>
                </button>
                <button className="action-btn" title="Search">
                  <span>🔍</span>
                </button>
                <button className="action-btn" title="Menu" onClick={() => setChatSettings(!chatSettings)}>
                  <span>⋮</span>
                </button>
              </div>
            </div>

            <div className="chat-messages">
              {messages.map((msg, index) => {
                const showDate = index === 0 || 
                  new Date(msg.time).toDateString() !== new Date(messages[index - 1]?.time).toDateString();
                
                return (
                  <React.Fragment key={msg.id || index}>
                    {showDate && (
                      <div className="date-divider">
                        <span>{new Date(msg.time).toLocaleDateString()}</span>
                      </div>
                    )}
                    <div className={`message-wrapper ${msg.sender}`}>
                      <div className={`message-bubble ${msg.sender}`}>
                        {msg.text && <p className="message-text">{msg.text}</p>}
                        {renderFileWithAnalysis(msg.fileUrl, msg.fileType, msg.fileName, msg.analysis, msg.status)}
                        <div className="message-footer">
                          <span className="message-time">{msg.time}</span>
                          {msg.sender === "me" && (
                            <span className="message-status">
                              {msg.status === 'sending' && '🕐'}
                              {msg.status === 'analyzing' && '🔬'}
                              {msg.status === 'analyzed' && '✓✓'}
                              {msg.status === 'sent' && '✓'}
                              {msg.status === 'delivered' && '✓✓'}
                              {msg.status === 'read' && '✓✓'}
                              {msg.status === 'failed' && '⚠️'}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  </React.Fragment>
                );
              })}
              
              {isTyping && (
                <div className="typing-indicator-wrapper">
                  <div className="typing-indicator">
                    <span></span>
                    <span></span>
                    <span></span>
                  </div>
                </div>
              )}
              
              <div ref={messagesEndRef} />
            </div>

            <div className="chat-footer">
              {/* Voice Recording Preview */}
              {audioUrl && !isRecording && (
                <div className="voice-preview">
                  <div className="voice-info">
                    <span className="voice-icon">🎤</span>
                    <span className="voice-duration">{formatRecordingTime(recordingTime)}</span>
                    <audio controls src={audioUrl} className="voice-audio-preview" />
                  </div>
                  <div className="voice-actions">
                    <button 
                      className="cancel-voice"
                      onClick={() => {
                        setAudioBlob(null);
                        setAudioUrl(null);
                        setRecordingTime(0);
                      }}
                    >
                      ✕
                    </button>
                    <button 
                      className="send-voice"
                      onClick={sendVoiceMessage}
                      disabled={isUploading}
                    >
                      ➤
                    </button>
                  </div>
                </div>
              )}

              {/* File Preview */}
              {selectedFile && !audioUrl && (
                <div className="file-preview">
                  <div className="file-info">
                    <span className="file-icon">📎</span>
                    <span className="file-name">{selectedFile.name}</span>
                    <span className="file-size">
                      {(selectedFile.size / 1024 / 1024).toFixed(2)} MB
                    </span>
                  </div>
                  <button 
                    className="remove-file"
                    onClick={() => {
                      setSelectedFile(null);
                      if (fileInputRef.current) fileInputRef.current.value = "";
                    }}
                  >
                    ✕
                  </button>
                  {isUploading && (
                    <div className="upload-progress">
                      <div className="progress-bar" style={{ width: `${uploadProgress}%` }}></div>
                    </div>
                  )}
                </div>
              )}

              {/* Recording Indicator */}
              {isRecording && (
                <div className="recording-indicator">
                  <span className="recording-dot"></span>
                  <span className="recording-time">{formatRecordingTime(recordingTime)}</span>
                  <div className="recording-actions">
                    <button className="cancel-recording" onClick={cancelRecording}>✕</button>
                    <button className="stop-recording" onClick={stopRecording}>⬛</button>
                  </div>
                </div>
              )}
              
              <div className="chat-input-container">
                <div className="input-actions">
                  <div className="attach-wrapper" ref={attachMenuRef}>
                    <button 
                      className="action-btn"
                      onClick={() => setShowAttachMenu(!showAttachMenu)}
                      disabled={isUploading || isRecording}
                    >
                      <span>➕</span>
                    </button>
                    
                    {showAttachMenu && (
                      <div className="attach-menu">
                        <button className="attach-option" onClick={() => fileInputRef.current?.click()}>
                          <span className="attach-icon">📄</span>
                          <span className="attach-label">Document</span>
                        </button>
                        <button className="attach-option" onClick={() => {
                          fileInputRef.current?.click();
                          fileInputRef.current.accept = "image/*";
                        }}>
                          <span className="attach-icon">📷</span>
                          <span className="attach-label">Gallery</span>
                        </button>
                        <button className="attach-option" onClick={startRecording}>
                          <span className="attach-icon">🎤</span>
                          <span className="attach-label">Voice</span>
                        </button>
                        <button className="attach-option" onClick={() => {
                          fileInputRef.current?.click();
                          fileInputRef.current.accept = "video/*";
                        }}>
                          <span className="attach-icon">🎥</span>
                          <span className="attach-label">Video</span>
                        </button>
                      </div>
                    )}
                  </div>

                  <button className="action-btn" onClick={() => setShowEmojiPicker(!showEmojiPicker)}>
                    <span>😊</span>
                  </button>
                </div>

                <input
                  type="file"
                  ref={fileInputRef}
                  style={{ display: "none" }}
                  onChange={handleFileSelect}
                />

                <input
                  type="text"
                  className="message-input"
                  placeholder="Type a message"
                  value={input}
                  onChange={handleTyping}
                  onKeyDown={handleKeyPress}
                  disabled={isUploading || isRecording || audioUrl !== null}
                />

                <button 
                  className={`send-btn ${(!input.trim() && !selectedFile && !audioBlob) || isUploading ? 'disabled' : ''}`}
                  onClick={handleSend}
                  disabled={(!input.trim() && !selectedFile && !audioBlob) || isUploading}
                >
                  {isUploading ? '⏳' : '➤'}
                </button>
              </div>
            </div>
          </>
        ) : (
          <div className="welcome-screen">
            <div className="welcome-content">
              <div className="welcome-icon">💬</div>
              <h2>Welcome to WhatsApp</h2>
              <p>Select a chat to start messaging</p>
              <div className="welcome-features">
                <div className="feature">
                  <span>🔒</span>
                  <span>End-to-end encrypted</span>
                </div>
                <div className="feature">
                  <span>🎤</span>
                  <span>Voice messages</span>
                </div>
                <div className="feature">
                  <span>📎</span>
                  <span>File sharing</span>
                </div>
                <div className="feature">
                  <span>📹</span>
                  <span>Video calls</span>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default Home;