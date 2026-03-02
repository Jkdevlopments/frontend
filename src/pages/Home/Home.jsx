import React, { useState, useEffect } from "react";
import "./Home.css";

const Home = ({ user, setUser }) => {
  const [selectedChat, setSelectedChat] = useState(null);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [onlineUsers, setOnlineUsers] = useState([]);

  // ✅ Fetch online users from DB
  useEffect(() => {
    const fetchOnlineUsers = async () => {
      try {
        const res = await fetch(
          `http://localhost:5000/api/online-users/${user.id}`
        );
        const data = await res.json();
        setOnlineUsers(data.users);
      } catch (err) {
        console.error("Error fetching users:", err);
      }
    };

    fetchOnlineUsers();

    // 🔥 Auto refresh every 5 seconds (optional)
    const interval = setInterval(fetchOnlineUsers, 5000);

    return () => clearInterval(interval);
  }, [user.id]);

  const sendMessage = () => {
    if (input.trim() === "") return;

    setMessages([...messages, { text: input, sender: "me" }]);
    setInput("");
  };

  // ✅ LOGOUT FUNCTION
  const handleLogout = async () => {
    try {
      await fetch("http://localhost:5000/api/logout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: user.id,
          deviceId: localStorage.getItem("deviceId"),
        }),
      });

      localStorage.removeItem("user");
      localStorage.removeItem("deviceId");
      setUser(null);
    } catch (err) {
      console.error("Logout failed", err);
    }
  };

  return (
    <div className="home-container">
      
      {/* Sidebar */}
      <div className="sidebar">
        <div className="profile">
          <h3>{user?.name}</h3>
          <p>{user?.phone}</p>
          <span className="online-status">● Online</span>

          <button className="logout-btn" onClick={handleLogout}>
            Logout
          </button>
        </div>

        <div className="contact-list">
          {onlineUsers.length === 0 ? (
            <p style={{ padding: "10px" }}>No users online</p>
          ) : (
            onlineUsers.map((u) => (
              <div
                key={u.id}
                className="contact"
                onClick={() => setSelectedChat(u)}
              >
                {u.name}
              </div>
            ))
          )}
        </div>
      </div>

      {/* Chat Section */}
      <div className="chat-section">
        <div className="chat-header">
          <h3>
            {selectedChat ? selectedChat.name : "Select a user"}
          </h3>
        </div>

        <div className="chat-messages">
          {messages.map((msg, index) => (
            <div
              key={index}
              className={`message ${msg.sender === "me" ? "me" : "other"}`}
            >
              {msg.text}
            </div>
          ))}
        </div>

        {selectedChat && (
          <div className="chat-input">
            <input
              type="text"
              placeholder="Type a message"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && sendMessage()}
            />
            <button onClick={sendMessage}>Send</button>
          </div>
        )}
      </div>
    </div>
  );
};

export default Home;