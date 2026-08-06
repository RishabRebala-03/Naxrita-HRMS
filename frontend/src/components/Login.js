// src/components/Login.js
import React, { useState } from "react";
import { AlertCircle } from "lucide-react";
import "../Login.css";

const Login = ({ onLoginSuccess }) => {
  const [credentials, setCredentials] = useState({ email: "", password: "" });
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
    setError("");
    setLoading(true);
    
    if (!credentials.email || !credentials.password) {
      setError("Please enter both email and password");
      setLoading(false);
      return;
    }
    
    try {
      const backendUrl = process.env.REACT_APP_BACKEND_URL || "http://localhost:5000";
      const response = await fetch(`${backendUrl}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(credentials),
      });
      
      const data = await response.json();
      
      if (response.ok) {
        const userData = {
          ...data.user,
          photoUrl: data.user?.photoUrl || null,   
        };
        
        // ✅ CRITICAL: Save to localStorage
        localStorage.setItem('user', JSON.stringify(userData));
        console.log('💾 Session saved to localStorage');
        
        onLoginSuccess(userData);
      } else {
        setError(data.error || "Invalid credentials");
      }
    } catch (err) {
      console.error("Login error:", err);
      setError("Unable to connect to server. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleKeyPress = (e) => {
    if (e.key === "Enter") handleLogin();
  };

  return (
    <div className="login-page">
      {/* LEFT SIDE — Apple-style dark branding */}
      <div className="login-left apple-dark">
        <div className="apple-brand">
          <img
            src={require("../assets/naxicon.png")}
            alt="Company Logo"
            className="apple-logo"
          />
          <h1 className="apple-title">NAXRITA</h1>
          <p className="apple-subtitle">We commit, We deliver</p>
        </div>
      </div>

      {/* RIGHT SIDE — existing login form */}
      <div className="login-right">
        <div className="portal-header">
          <h2 className="portal-title">Naxrita HRMS Portal</h2>
        </div>
        <div className="login-card">
          <div className="login-header">
            <h1 className="login-title">Welcome Back</h1>
            <p className="login-subtitle">Sign in to your account</p>
          </div>

          {error && (
            <div className="error-box">
              <AlertCircle size={18} />
              <span>{error}</span>
            </div>
          )}

          <div className="input-group">
            <label>Email Address</label>
            <input
              type="email"
              value={credentials.email}
              onChange={(e) =>
                setCredentials({ ...credentials, email: e.target.value })
              }
              onKeyPress={handleKeyPress}
              placeholder="your.email@naxrita.com"
            />
          </div>

          <div className="input-group" style={{ position: "relative" }}>
            <label>Password</label>
            <input
              type={showPassword ? "text" : "password"}
              value={credentials.password}
              onChange={(e) =>
                setCredentials({ ...credentials, password: e.target.value })
              }
              onKeyPress={handleKeyPress}
              placeholder="Enter your password"
            />
            <button
              type="button"
              className="toggle-password"
              onClick={() => setShowPassword(!showPassword)}
            >
              {showPassword ? "Hide" : "Show"}
            </button>
          </div>

          <button
            className="login-btn"
            onClick={handleLogin}
            disabled={loading}
          >
            {loading ? "Signing in..." : "Sign In"}
          </button>
        </div>
      </div>
    </div>
  );
};

export default Login;