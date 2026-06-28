import React, { useState } from "react";
import { formatDateTimeIST } from "../utils/dateTime";

const LeaveBalance = () => {
  const [employeeId, setEmployeeId] = useState("");
  const [balance, setBalance] = useState(null);
  const [leave, setLeave] = useState({ leave_type:"Casual", start_date:"", end_date:"", reason:"" });
  const [managerEmail, setManagerEmail] = useState("");
  const [pending, setPending] = useState([]);

  const getBalance = async () => {
    try {
      const res = await fetch(`${process.env.REACT_APP_BACKEND_URL}/api/leaves/balance/${employeeId}`);
      const data = await res.json();
      setBalance(data);
    } catch(err){ console.error(err); alert("Failed to fetch balance"); }
  };

  const applyLeave = async () => {
    try {
      const res = await fetch(`${process.env.REACT_APP_BACKEND_URL}/api/leaves/apply`, {
        method:"POST", headers:{"Content-Type":"application/json"},
        body: JSON.stringify({ employee_id: employeeId, leave_type: leave.leave_type, start_date: leave.start_date, end_date: leave.end_date, reason: leave.reason })
      });
      const data = await res.json();
      if (res.ok) alert("Applied ✓"); else alert("Error: " + (data.error || "failed"));
    } catch(err){ console.error(err); alert("Network error"); }
  };

  const getPending = async () => {
    try {
      const res = await fetch(`${process.env.REACT_APP_BACKEND_URL}/api/leaves/pending/${encodeURIComponent(managerEmail)}`);
      const data = await res.json();
      setPending(data);
    } catch(err){ console.error(err); alert("Failed"); }
  };

  const updateStatus = async (id, status) => {
    try {
      const res = await fetch(`${process.env.REACT_APP_BACKEND_URL}/api/leaves/update_status/${id}`, {
        method:"PUT", headers:{"Content-Type":"application/json"}, body: JSON.stringify({ status })
      });
      if (res.ok) getPending();
      else alert("Failed to update");
    } catch(err){ console.error(err); alert("Network error"); }
  };

  return (
    <div className="panel">
      <h3>Leaves</h3>

      <div style={{display:"grid", gridTemplateColumns:"1fr 140px", gap:12}}>
        <input className="input" placeholder="Employee ID" value={employeeId} onChange={e=>setEmployeeId(e.target.value)} />
        <button className="btn" onClick={getBalance}>Get Balance</button>
      </div>

      {balance && (
        <div style={{marginTop:12}} className="card small">
          <div className="card-title">Leave Balance</div>
          <div style={{marginTop:8}}>
            <div className="kv"><div>Casual</div><div>{balance.casual}</div></div>
            <div className="kv"><div>Sick</div><div>{balance.sick}</div></div>
            <div className="kv"><div>Earned</div><div>{balance.earned}</div></div>
            <div className="kv"><div>LWP</div><div>{balance.lwp}</div></div>
          </div>
        </div>
      )}

      <hr style={{margin:"18px 0"}} />

      <h4>Apply for Leave</h4>
      <div style={{display:"grid", gridTemplateColumns:"1fr 1fr", gap:12}}>
        <select className="input" value={leave.leave_type} onChange={e=>setLeave({...leave, leave_type:e.target.value})}>
          <option>Casual</option><option>Sick</option><option>Earned</option><option>LWP</option>
        </select>
        <input className="input" placeholder="Start date (YYYY-MM-DD)" value={leave.start_date} onChange={e=>setLeave({...leave, start_date:e.target.value})} />
        <input className="input" placeholder="End date (YYYY-MM-DD)" value={leave.end_date} onChange={e=>setLeave({...leave, end_date:e.target.value})} />
        <input className="input" placeholder="Reason" value={leave.reason} onChange={e=>setLeave({...leave, reason:e.target.value})} />
      </div>
      <div style={{marginTop:12}}><button className="btn" onClick={applyLeave}>Apply</button></div>

      <hr style={{margin:"18px 0"}} />

      <h4>Manager: Pending Requests</h4>
      <div style={{display:"grid", gridTemplateColumns:"1fr 140px", gap:12}}>
        <input className="input" placeholder="Manager Email" value={managerEmail} onChange={e=>setManagerEmail(e.target.value)} />
        <button className="btn ghost" onClick={getPending}>Get Pending</button>
      </div>

      {pending.map(p => (
        <div key={p._id} className="card small" style={{marginTop:10}}>
          <div><strong>Employee:</strong> {p.employee_id}</div>
          <div className="muted">{p.leave_type} &middot; Applied: {formatDateTimeIST(p.applied_on, "-")}</div>
          <div style={{marginTop:8}}>
            <button className="btn" onClick={()=>updateStatus(p._id,"Approved")}>Approve</button>
            <button className="btn ghost" style={{background:"#fef3f2", color:"var(--danger)"}} onClick={()=>updateStatus(p._id,"Rejected")}>Reject</button>
          </div>
        </div>
      ))}

    </div>
  );
};

export default LeaveBalance;
