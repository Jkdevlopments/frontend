import React, { useState } from "react";
import axios from "axios";
import "./Login.css";

const Login = ({ onLogin }) => {
  const [step, setStep] = useState(1);
  const [phone, setPhone] = useState("");
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);

  const handlePhoneSubmit = (e) => {
    e.preventDefault();

    if (!/^\d{10}$/.test(phone)) {
      alert("Enter valid 10-digit mobile number");
      return;
    }

    setStep(2);
  };

  const handleFinalLogin = async (e) => {
    e.preventDefault();

    if (!name.trim()) {
      alert("Enter your name");
      return;
    }

    setLoading(true);

    try {
      // 🔥 Always use same deviceId per browser
      let deviceId = localStorage.getItem("deviceId");

      if (!deviceId) {
        deviceId = crypto.randomUUID();
        localStorage.setItem("deviceId", deviceId);
      }

      const deviceInfo = {
        userAgent: navigator.userAgent,
        platform: navigator.platform,
        language: navigator.language,
      };

      const response = await axios.post(
        "http://localhost:5000/api/login",
        {
          phone,
          name,
          deviceId,
          deviceInfo,
        }
      );

      const user = response.data.user;

      // ✅ Store both user + deviceId
      localStorage.setItem("user", JSON.stringify(user));
      localStorage.setItem("deviceId", deviceId);

      onLogin(user);

    } catch (error) {
      console.log("Login error:", error);
      alert("Login failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-container">
      <div className="login-box">
        <h2>SecureChat</h2>

        {step === 1 && (
          <form onSubmit={handlePhoneSubmit}>
            <input
              type="tel"
              placeholder="Enter mobile number"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              maxLength="10"
            />
            <button type="submit">Next</button>
          </form>
        )}

        {step === 2 && (
          <form onSubmit={handleFinalLogin}>
            <input
              type="text"
              placeholder="Enter your name"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
            <button type="submit" disabled={loading}>
              {loading ? "Logging in..." : "Login"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
};

export default Login;