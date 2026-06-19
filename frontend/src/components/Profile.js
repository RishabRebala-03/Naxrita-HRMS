import React, { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  BadgeCheck,
  BriefcaseBusiness,
  CalendarDays,
  Camera,
  Copy,
  IdCard,
  KeyRound,
  MapPin,
  PencilLine,
  Shield,
  UserRound,
  Users,
} from "lucide-react";
import { buildRequesterHeaders } from "../utils/requester";

const cleanDate = (value) => {
  if (!value) return null;

  return String(value)
    .replace(/\.\d+/, "")
    .replace("Z", "")
    .replace("+00:00", "")
    .trim();
};

const Profile = ({ user, role, viewEmployeeId = null, onUserUpdate, onBack }) => {
  const requesterHeaders = buildRequesterHeaders(user);
  const [employeeId, setEmployeeId] = useState("");
  const [profile, setProfile] = useState(null);
  const [isEditing, setIsEditing] = useState(false);
  const [editForm, setEditForm] = useState({});
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [showProjectModal, setShowProjectModal] = useState(false);
  const [projectForm, setProjectForm] = useState({
    _id: null,
    projectId: "",
    name: "",
    startDate: "",
    endDate: "",
  });
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [passwordForm, setPasswordForm] = useState({
    currentPassword: "",
    newPassword: "",
    confirmPassword: "",
  });
  const [passwordError, setPasswordError] = useState("");
  const [availableProjects, setAvailableProjects] = useState([]);
  const [selectedProjectId, setSelectedProjectId] = useState("");

  const formatDate = (dateValue) => {
    if (!dateValue) return "Not available";

    try {
      const date = new Date(cleanDate(dateValue));
      if (Number.isNaN(date.getTime())) return "Not available";

      return date.toLocaleDateString("en-US", {
        year: "numeric",
        month: "short",
        day: "numeric",
      });
    } catch {
      return "Not available";
    }
  };

  const dateToInputFormat = (value) => {
    if (!value) return "";

    const date = new Date(cleanDate(value));
    if (Number.isNaN(date.getTime())) return "";

    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");

    return `${year}-${month}-${day}`;
  };

  const formatProjectDate = (dateValue) => {
    if (!dateValue) return "Present";

    const date = new Date(dateValue);
    if (Number.isNaN(date.getTime())) return "Present";

    return date.toLocaleDateString("en-US", {
      month: "short",
      year: "numeric",
    });
  };

  const calculateTenure = (startDate) => {
    if (!startDate) return "Not available";

    const date = new Date(cleanDate(startDate));
    if (Number.isNaN(date.getTime())) return "Not available";

    const today = new Date();
    if (date > today) return "0 years 0 months 0 days";

    let years = today.getFullYear() - date.getFullYear();
    let months = today.getMonth() - date.getMonth();
    let days = today.getDate() - date.getDate();

    if (days < 0) {
      months -= 1;
      days += new Date(today.getFullYear(), today.getMonth(), 0).getDate();
    }

    if (months < 0) {
      years -= 1;
      months += 12;
    }

    return `${years} years ${months} months ${days} days`;
  };

  const resetEditForm = (data) => {
    setEditForm({
      name: data.name || "",
      email: data.email || "",
      designation: data.designation || "",
      department: data.department || "",
      shiftTimings: data.shiftTimings || "",
      dateOfJoining: dateToInputFormat(data.dateOfJoining),
      dateOfBirth: dateToInputFormat(data.dateOfBirth),
      reportsToEmail: data.reportsToEmail || "",
      workLocation: data.workLocation || "",
      companyCode: data.companyCode || "",
      costCenter: data.costCenter || "",
      peopleLeadEmail: data.peopleLeadEmail || "",
    });
  };

  const fetchAvailableProjects = async () => {
    try {
      const response = await fetch(`${process.env.REACT_APP_BACKEND_URL}/api/projects/`);
      const data = await response.json();
      setAvailableProjects(data);
    } catch (error) {
      console.error("Error fetching projects:", error);
    }
  };

  const fetchProfile = async (userId) => {
    if (!userId || typeof userId !== "string" || !/^[a-f0-9]{24}$/i.test(userId)) {
      setMessage("Invalid user ID format");
      return;
    }

    setLoading(true);
    try {
      const response = await fetch(`${process.env.REACT_APP_BACKEND_URL}/api/users/${userId}`);

      if (!response.ok) {
        const error = await response.json();
        setMessage(error.error || "Employee not found");
        setProfile(null);
        return;
      }

      const data = await response.json();
      setProfile(data);
      resetEditForm(data);
      setMessage("");
    } catch (error) {
      console.error("Error fetching profile:", error);
      setMessage("Failed to fetch profile");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let targetId = null;

    if (viewEmployeeId) {
      if (typeof viewEmployeeId === "object" && viewEmployeeId !== null) {
        targetId = viewEmployeeId._id || viewEmployeeId.id || viewEmployeeId.employeeId || null;
      } else {
        targetId = viewEmployeeId;
      }
    } else if (user?.id) {
      targetId = user.id;
    }

    if (!targetId || typeof targetId !== "string" || !/^[a-f0-9]{24}$/i.test(targetId)) {
      setMessage("Invalid employee ID");
      setLoading(false);
      return;
    }

    setEmployeeId(targetId);
    fetchProfile(targetId);

    if (role === "Admin") {
      fetchAvailableProjects();
    }
  }, [viewEmployeeId, user, role]);

  const handleEdit = () => {
    setIsEditing(true);
    setMessage("");
  };

  const handleCancel = () => {
    setIsEditing(false);
    if (profile) {
      resetEditForm(profile);
    }
    setMessage("");
  };

  const handleInputChange = (field, value) => {
    setEditForm((previous) => ({ ...previous, [field]: value }));
  };

  const handleEditProject = (project) => {
    setProjectForm({
      _id: project._id,
      projectId: project.projectId,
      name: project.projectName || project.name,
      startDate: dateToInputFormat(project.startDate),
      endDate: project.endDate ? dateToInputFormat(project.endDate) : "",
    });
    setSelectedProjectId(project.projectId ? String(project.projectId) : "");
    setShowProjectModal(true);
  };

  const deleteProject = async (projectId) => {
    if (!projectId || projectId === "undefined") {
      alert("Cannot delete project: Invalid project ID");
      return;
    }

    if (!window.confirm("Remove this project assignment?")) return;

    await fetch(
      `${process.env.REACT_APP_BACKEND_URL}/api/users/delete_project/${employeeId}/${projectId}`,
      {
        method: "DELETE",
        headers: requesterHeaders,
      }
    );

    fetchProfile(employeeId);
  };

  const saveProject = async () => {
    if (!selectedProjectId && !projectForm._id) {
      setMessage("Please select a project");
      return;
    }

    if (!projectForm.startDate) {
      setMessage("Please select a start date");
      return;
    }

    const url = projectForm._id
      ? `${process.env.REACT_APP_BACKEND_URL}/api/users/update_project/${employeeId}/${projectForm._id}`
      : `${process.env.REACT_APP_BACKEND_URL}/api/users/assign_project/${employeeId}`;

    const payload = projectForm._id
      ? {
          startDate: projectForm.startDate,
          endDate: projectForm.endDate || null,
        }
      : {
          projectId: selectedProjectId,
          startDate: projectForm.startDate,
          endDate: projectForm.endDate || null,
        };

    try {
      const response = await fetch(url, {
        method: projectForm._id ? "PUT" : "POST",
        headers: buildRequesterHeaders(user, { "Content-Type": "application/json" }),
        body: JSON.stringify(payload),
      });

      const data = await response.json();

      if (response.ok) {
        setMessage("Project assignment updated successfully.");
        setShowProjectModal(false);
        setSelectedProjectId("");
        fetchProfile(employeeId);
        setTimeout(() => setMessage(""), 3000);
      } else {
        setMessage(data.error || "Failed to save project");
      }
    } catch {
      setMessage("Network error");
    }
  };

  const handleSave = async () => {
    setLoading(true);
    try {
      const updateData = {
        name: editForm.name,
        email: editForm.email,
        designation: editForm.designation,
        department: editForm.department,
        shiftTimings: editForm.shiftTimings,
        reportsToEmail: editForm.reportsToEmail || "",
        workLocation: editForm.workLocation || "",
        companyCode: editForm.companyCode || "",
        costCenter: editForm.costCenter || "",
        peopleLeadEmail: editForm.peopleLeadEmail || "",
      };

      if (editForm.dateOfBirth && /^\d{4}-\d{2}-\d{2}$/.test(editForm.dateOfBirth.trim())) {
        updateData.dateOfBirth = editForm.dateOfBirth.trim();
      } else {
        updateData.dateOfBirth = null;
      }

      if (editForm.dateOfJoining && /^\d{4}-\d{2}-\d{2}$/.test(editForm.dateOfJoining.trim())) {
        updateData.dateOfJoining = editForm.dateOfJoining.trim();
      } else {
        updateData.dateOfJoining = null;
      }

      const response = await fetch(
        `${process.env.REACT_APP_BACKEND_URL}/api/users/update_user/${employeeId}`,
        {
          method: "PUT",
          headers: buildRequesterHeaders(user, { "Content-Type": "application/json" }),
          body: JSON.stringify(updateData),
        }
      );

      const data = await response.json();

      if (response.ok) {
        setMessage("Profile updated successfully.");
        setIsEditing(false);
        await fetchProfile(employeeId);

        if (user?.id === employeeId && onUserUpdate) {
          const updatedUserResponse = await fetch(
            `${process.env.REACT_APP_BACKEND_URL}/api/users/${employeeId}`
          );
          const updatedUser = await updatedUserResponse.json();

          onUserUpdate({
            ...user,
            photoUrl: updatedUser.photoUrl,
            name: updatedUser.name,
            email: updatedUser.email,
          });
        }
      } else {
        setMessage(`Error: ${data.error}`);
      }
    } catch (error) {
      console.error(error);
      setMessage("Network error");
    } finally {
      setLoading(false);
    }
  };

  const copyToClipboard = (text, label) => {
    navigator.clipboard.writeText(text || "");
    setMessage(`${label} copied to clipboard`);
    setTimeout(() => setMessage(""), 2000);
  };

  const handlePasswordChange = async () => {
    setPasswordError("");

    if (role === "Admin" && !isOwnProfile) {
      if (!passwordForm.newPassword || !passwordForm.confirmPassword) {
        setPasswordError("New password and confirmation are required");
        return;
      }
    } else if (
      !passwordForm.currentPassword ||
      !passwordForm.newPassword ||
      !passwordForm.confirmPassword
    ) {
      setPasswordError("All fields are required");
      return;
    }

    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      setPasswordError("New passwords do not match");
      return;
    }

    if (passwordForm.newPassword.length < 6) {
      setPasswordError("New password must be at least 6 characters");
      return;
    }

    if (isOwnProfile && passwordForm.currentPassword === passwordForm.newPassword) {
      setPasswordError("New password must be different from current password");
      return;
    }

    setLoading(true);
    try {
      const requestBody = { password: passwordForm.newPassword };

      if (isOwnProfile) {
        requestBody.currentPassword = passwordForm.currentPassword;
      }

      const response = await fetch(
        `${process.env.REACT_APP_BACKEND_URL}/api/users/update_user/${employeeId}`,
        {
          method: "PUT",
          headers: buildRequesterHeaders(user, { "Content-Type": "application/json" }),
          body: JSON.stringify(requestBody),
        }
      );

      const data = await response.json();

      if (response.ok) {
        setMessage(
          role === "Admin" && !isOwnProfile
            ? `Password changed successfully for ${profile?.name}.`
            : "Password changed successfully."
        );
        setShowPasswordModal(false);
        setPasswordForm({ currentPassword: "", newPassword: "", confirmPassword: "" });
        setTimeout(() => setMessage(""), 3000);
      } else {
        setPasswordError(data.error || "Failed to change password");
      }
    } catch {
      setPasswordError("Network error");
    } finally {
      setLoading(false);
    }
  };

  const isOwnProfile = user?.id === employeeId;
  const canEditProfile = role === "Admin";
  const canChangePassword = role === "Admin" || isOwnProfile;
  const canChangePhoto = role === "Admin" || isOwnProfile;

  const backLabel = viewEmployeeId ? "Back to Employees" : "Back to Dashboard";

  const profileProjects = useMemo(
    () => (Array.isArray(profile?.projects) ? profile.projects.filter(Boolean) : []),
    [profile]
  );

  if (loading && !profile) {
    return (
      <section className="profile-workspace">
        <div className="fiori-loading-card">
          <UserRound size={28} />
          <div>
            <strong>Loading profile</strong>
            <p>Preparing employee information and assignments.</p>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="profile-workspace">
      <div className="profile-nav-row">
        <button className="fiori-button secondary" onClick={onBack}>
          <ArrowLeft size={16} />
          <span>{backLabel}</span>
        </button>
      </div>

      <header className="profile-hero">
        <div className="profile-hero-main">
          <div className="profile-avatar-shell">
            <img
              src={
                profile?.photoUrl ||
                `https://ui-avatars.com/api/?name=${encodeURIComponent(profile?.name || "User")}`
              }
              alt={profile?.name || "Profile"}
              className="profile-hero-avatar"
            />
          </div>

          <div>
            <div className="admin-section-overline">
              {isOwnProfile ? "Self Profile" : "Employee Profile"}
            </div>
            <h1>{profile?.name || "Profile"}</h1>
            <p>{profile?.designation || "Designation not available"}</p>
            <div className="profile-hero-meta">
              <span>{profile?.department || "Department not assigned"}</span>
              <span>{profile?.role || "Employee"}</span>
              <span>{profile?.workLocation || "Work location not set"}</span>
            </div>
          </div>
        </div>

        <div className="profile-hero-actions">
          {canEditProfile && (
            <button className="fiori-button primary" onClick={handleEdit}>
              <PencilLine size={16} />
              <span>Edit Profile</span>
            </button>
          )}

          {canChangePassword && (
            <button className="fiori-button secondary" onClick={() => setShowPasswordModal(true)}>
              <KeyRound size={16} />
              <span>Change Password</span>
            </button>
          )}

          {canChangePhoto && (
            <>
              <button
                className="fiori-button secondary"
                onClick={() => document.getElementById("uploadPhotoInput").click()}
              >
                <Camera size={16} />
                <span>Change Photo</span>
              </button>

              <input
                type="file"
                id="uploadPhotoInput"
                style={{ display: "none" }}
                accept="image/png,image/jpeg,image/webp"
                onChange={async (event) => {
                  if (!event.target.files.length) return;

                  const file = event.target.files[0];

                  if (file.size > 2 * 1024 * 1024) {
                    setMessage("Error: File size must be under 2 MB");
                    return;
                  }

                  const formData = new FormData();
                  formData.append("photo", file);

                  const response = await fetch(
                    `${process.env.REACT_APP_BACKEND_URL}/api/users/upload_photo/${employeeId}`,
                    {
                      method: "POST",
                      headers: requesterHeaders,
                      body: formData,
                    }
                  );

                  const data = await response.json();

                  if (response.ok) {
                    setMessage("Profile photo updated successfully.");
                    fetchProfile(employeeId);
                  } else {
                    setMessage(`Error: ${data.error}`);
                  }
                }}
              />
            </>
          )}
        </div>
      </header>

      {!isEditing && profile && (
        <>
          <div className="profile-summary-grid">
            <article className="fiori-stat-card">
              <div className="fiori-stat-topline">
                <span className="fiori-stat-label">Employee ID</span>
                <IdCard size={18} />
              </div>
              <div className="fiori-stat-note is-mono">{profile.employeeId || profile._id}</div>
            </article>
            <article className="fiori-stat-card">
              <div className="fiori-stat-topline">
                <span className="fiori-stat-label">Date of Joining</span>
                <CalendarDays size={18} />
              </div>
              <div className="fiori-stat-note">{formatDate(profile.dateOfJoining)}</div>
            </article>
            <article className="fiori-stat-card">
              <div className="fiori-stat-topline">
                <span className="fiori-stat-label">Tenure</span>
                <BadgeCheck size={18} />
              </div>
              <div className="fiori-stat-note">{calculateTenure(profile.dateOfJoining)}</div>
            </article>
            <article className="fiori-stat-card">
              <div className="fiori-stat-topline">
                <span className="fiori-stat-label">Assigned Projects</span>
                <BriefcaseBusiness size={18} />
              </div>
              <div className="fiori-stat-note">{profileProjects.length}</div>
            </article>
          </div>

          <div className="profile-layout">
            <div className="profile-main">
              <section className="fiori-panel">
                <div className="fiori-panel-header">
                  <div>
                    <h3>Contact and identity</h3>
                    <p>Primary identifiers and day-to-day communication details</p>
                  </div>
                </div>

                <div className="profile-info-grid">
                  <div className="profile-info-card">
                    <div className="profile-info-label">Email</div>
                    <div className="profile-info-value with-action">
                      <span>{profile.email || "Not available"}</span>
                      <button
                        className="fiori-inline-button"
                        onClick={() => copyToClipboard(profile.email, "Email")}
                      >
                        <Copy size={14} />
                        <span>Copy</span>
                      </button>
                    </div>
                  </div>

                  <div className="profile-info-card">
                    <div className="profile-info-label">Date of Birth</div>
                    <div className="profile-info-value">{formatDate(profile.dateOfBirth)}</div>
                  </div>

                  <div className="profile-info-card">
                    <div className="profile-info-label">Work Location</div>
                    <div className="profile-info-value">
                      <MapPin size={14} />
                      <span>{profile.workLocation || "Not set"}</span>
                    </div>
                  </div>

                  <div className="profile-info-card">
                    <div className="profile-info-label">Company Code</div>
                    <div className="profile-info-value">{profile.companyCode || "Not set"}</div>
                  </div>

                  <div className="profile-info-card">
                    <div className="profile-info-label">Cost Center</div>
                    <div className="profile-info-value">{profile.costCenter || "Not set"}</div>
                  </div>

                  <div className="profile-info-card">
                    <div className="profile-info-label">Shift Timings</div>
                    <div className="profile-info-value">{profile.shiftTimings || "Not set"}</div>
                  </div>
                </div>
              </section>

              <section className="fiori-panel">
                <div className="fiori-panel-header">
                  <div>
                    <h3>Reporting and assignment</h3>
                    <p>Manager, talent lead, and current assignment structure</p>
                  </div>
                </div>

                <div className="profile-info-grid">
                  <div className="profile-info-card">
                    <div className="profile-info-label">Reports To</div>
                    <div className="profile-info-value">{profile.reportsToEmail || "Not assigned"}</div>
                  </div>

                  <div className="profile-info-card">
                    <div className="profile-info-label">Talent Lead</div>
                    <div className="profile-info-value">{profile.peopleLeadEmail || "Not assigned"}</div>
                  </div>

                  <div className="profile-info-card">
                    <div className="profile-info-label">Role</div>
                    <div className="profile-info-value">
                      <Shield size={14} />
                      <span>{profile.role || "Employee"}</span>
                    </div>
                  </div>

                  <div className="profile-info-card">
                    <div className="profile-info-label">Department</div>
                    <div className="profile-info-value">
                      <Users size={14} />
                      <span>{profile.department || "Not assigned"}</span>
                    </div>
                  </div>
                </div>
              </section>

              <section className="fiori-panel">
                <div className="fiori-panel-header">
                  <div>
                    <h3>Projects</h3>
                    <p>Project assignments and duration details</p>
                  </div>
                  {role === "Admin" && (
                    <button
                      className="fiori-button secondary"
                      onClick={() => {
                        setProjectForm({
                          _id: null,
                          projectId: "",
                          name: "",
                          startDate: dateToInputFormat(new Date()),
                          endDate: "",
                        });
                        setSelectedProjectId("");
                        setShowProjectModal(true);
                      }}
                    >
                      Assign Project
                    </button>
                  )}
                </div>

                {profileProjects.length > 0 ? (
                  <div className="fiori-table-shell">
                    <table className="fiori-table">
                      <thead>
                        <tr>
                          <th>Project</th>
                          <th>Start</th>
                          <th>End</th>
                          <th>Duration</th>
                          {role === "Admin" ? <th>Actions</th> : null}
                        </tr>
                      </thead>
                      <tbody>
                        {profileProjects.map((project) => {
                          const startDate = new Date(project.startDate);
                          const endDate = project.endDate ? new Date(project.endDate) : new Date();
                          let duration = "Not available";

                          if (!Number.isNaN(startDate.getTime()) && !Number.isNaN(endDate.getTime())) {
                            const totalDays = Math.floor((endDate - startDate) / (1000 * 60 * 60 * 24));
                            const months = Math.floor(totalDays / 30);
                            const days = totalDays % 30;
                            duration = project.endDate
                              ? `${months} months ${days} days`
                              : `Ongoing • ${months} months ${days} days`;
                          }

                          return (
                            <tr key={project._id}>
                              <td>
                                <div className="fiori-primary-cell">
                                  <strong>{project.projectName || project.name}</strong>
                                  <span>{project.projectId || "Assigned project"}</span>
                                </div>
                              </td>
                              <td>{formatProjectDate(project.startDate)}</td>
                              <td>{formatProjectDate(project.endDate)}</td>
                              <td>{duration}</td>
                              {role === "Admin" ? (
                                <td>
                                  <div className="employee-table-actions">
                                    <button className="fiori-button secondary" onClick={() => handleEditProject(project)}>
                                      Edit
                                    </button>
                                    <button
                                      className="fiori-button secondary danger"
                                      onClick={() => deleteProject(project._id)}
                                    >
                                      Remove
                                    </button>
                                  </div>
                                </td>
                              ) : null}
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="admin-empty-state">
                    <BriefcaseBusiness size={24} />
                    <div>
                      <strong>No projects assigned</strong>
                      <p>Project assignments will appear here once added.</p>
                    </div>
                  </div>
                )}
              </section>
            </div>

            <aside className="profile-side">
              <section className="fiori-panel">
                <div className="fiori-panel-header">
                  <div>
                    <h3>Leave balance</h3>
                    <p>Current available leave categories</p>
                  </div>
                </div>

                {profile.leaveBalance ? (
                  <div className="profile-balance-grid">
                    <div className="profile-balance-card">
                      <span>Sick</span>
                      <strong>{profile.leaveBalance.sick || 0}</strong>
                    </div>
                    <div className="profile-balance-card">
                      <span>Planned</span>
                      <strong>{profile.leaveBalance.planned || 0}</strong>
                    </div>
                    <div className="profile-balance-card">
                      <span>Optional</span>
                      <strong>{profile.leaveBalance.optional || 0}</strong>
                    </div>
                    <div className="profile-balance-card">
                      <span>LWP</span>
                      <strong>{profile.leaveBalance.lwp || 0}</strong>
                    </div>
                  </div>
                ) : (
                  <div className="admin-empty-state">
                    <CalendarDays size={24} />
                    <div>
                      <strong>No leave balance data</strong>
                      <p>Leave balance information is not available for this user.</p>
                    </div>
                  </div>
                )}
              </section>
            </aside>
          </div>
        </>
      )}

      {profile && isEditing && (
        <section className="fiori-panel">
          <div className="fiori-panel-header">
            <div>
              <h3>Edit profile</h3>
              <p>Update employee profile details and reporting information</p>
            </div>
          </div>

          <div className="profile-edit-grid">
            {[
              ["name", "Full Name *", "text", "Full name"],
              ["email", "Email *", "email", "Email"],
              ["designation", "Designation *", "text", "Designation"],
              ["department", "Department", "text", "Department"],
              ["shiftTimings", "Shift Timings", "text", "e.g. 9:00 AM - 6:00 PM"],
              ["dateOfJoining", "Date of Joining", "date", ""],
              ["dateOfBirth", "Date of Birth", "date", ""],
              ["workLocation", "Work Location", "text", "e.g. Hyderabad Office"],
              ["companyCode", "Company Code", "text", "Assigned by admin"],
              ["costCenter", "Cost Center", "text", "Assigned by admin"],
            ].map(([field, label, type, placeholder]) => (
              <label key={field} className="profile-edit-field">
                <span>{label}</span>
                <input
                  className="input"
                  type={type}
                  value={editForm[field] || ""}
                  onChange={(event) => handleInputChange(field, event.target.value)}
                  placeholder={placeholder}
                  max={field === "dateOfBirth" ? new Date().toISOString().split("T")[0] : undefined}
                />
              </label>
            ))}

            {role === "Admin" && (
              <>
                <label className="profile-edit-field">
                  <span>People Lead / HR Manager Email</span>
                  <input
                    className="input"
                    type="email"
                    value={editForm.peopleLeadEmail || ""}
                    onChange={(event) => handleInputChange("peopleLeadEmail", event.target.value)}
                    placeholder="hr@example.com"
                  />
                </label>

                <label className="profile-edit-field">
                  <span>Manager Email (Reports To)</span>
                  <input
                    className="input"
                    type="email"
                    value={editForm.reportsToEmail || ""}
                    onChange={(event) => handleInputChange("reportsToEmail", event.target.value)}
                    placeholder="manager@example.com"
                  />
                </label>
              </>
            )}
          </div>

          <div className="admin-modal-actions">
            <button className="fiori-button secondary" onClick={handleCancel} disabled={loading}>
              Cancel
            </button>
            <button
              className="fiori-button primary"
              onClick={handleSave}
              disabled={loading || !editForm.name || !editForm.email || !editForm.designation}
            >
              {loading ? "Saving..." : "Save Changes"}
            </button>
          </div>
        </section>
      )}

      {showPasswordModal && (
        <div
          className="admin-modal-overlay"
          onClick={() => {
            setShowPasswordModal(false);
            setPasswordForm({ currentPassword: "", newPassword: "", confirmPassword: "" });
            setPasswordError("");
          }}
        >
          <div className="admin-modal" onClick={(event) => event.stopPropagation()}>
            <div className="admin-modal-header">
              <div>
                <div className="admin-section-overline">Security</div>
                <h2>Change Password</h2>
                <p>
                  {role === "Admin" && !isOwnProfile
                    ? `Set a new password for ${profile?.name}`
                    : "Enter your current password and choose a new one"}
                </p>
              </div>
            </div>

            <div className="profile-modal-stack">
              {isOwnProfile && (
                <label className="profile-edit-field">
                  <span>Current Password *</span>
                  <input
                    className="input"
                    type="password"
                    value={passwordForm.currentPassword}
                    onChange={(event) =>
                      setPasswordForm((previous) => ({
                        ...previous,
                        currentPassword: event.target.value,
                      }))
                    }
                  />
                </label>
              )}

              <label className="profile-edit-field">
                <span>New Password *</span>
                <input
                  className="input"
                  type="password"
                  value={passwordForm.newPassword}
                  onChange={(event) =>
                    setPasswordForm((previous) => ({
                      ...previous,
                      newPassword: event.target.value,
                    }))
                  }
                />
              </label>

              <label className="profile-edit-field">
                <span>Confirm New Password *</span>
                <input
                  className="input"
                  type="password"
                  value={passwordForm.confirmPassword}
                  onChange={(event) =>
                    setPasswordForm((previous) => ({
                      ...previous,
                      confirmPassword: event.target.value,
                    }))
                  }
                />
              </label>

              {passwordError && (
                <div className="admin-toast is-error" style={{ position: "static", maxWidth: "100%" }}>
                  {passwordError}
                </div>
              )}
            </div>

            <div className="admin-modal-actions">
              <button
                className="fiori-button secondary"
                onClick={() => {
                  setShowPasswordModal(false);
                  setPasswordForm({ currentPassword: "", newPassword: "", confirmPassword: "" });
                  setPasswordError("");
                }}
              >
                Cancel
              </button>
              <button
                className="fiori-button primary"
                onClick={handlePasswordChange}
                disabled={
                  loading ||
                  !passwordForm.newPassword ||
                  !passwordForm.confirmPassword ||
                  (isOwnProfile && !passwordForm.currentPassword)
                }
              >
                {loading ? "Changing..." : "Change Password"}
              </button>
            </div>
          </div>
        </div>
      )}

      {showProjectModal && (
        <div className="admin-modal-overlay" onClick={() => setShowProjectModal(false)}>
          <div className="admin-modal" onClick={(event) => event.stopPropagation()}>
            <div className="admin-modal-header">
              <div>
                <div className="admin-section-overline">Project Assignment</div>
                <h2>{projectForm._id ? "Edit Project Assignment" : "Assign Project"}</h2>
              </div>
            </div>

            <div className="profile-modal-stack">
              {!projectForm._id ? (
                <label className="profile-edit-field">
                  <span>Select Project *</span>
                  <select
                    className="input"
                    value={selectedProjectId}
                    onChange={(event) => {
                      setSelectedProjectId(event.target.value);
                      const selected = availableProjects.find((project) => project._id === event.target.value);
                      if (selected) {
                        setProjectForm((previous) => ({
                          ...previous,
                          name: selected.title,
                          projectId: selected._id,
                        }));
                      }
                    }}
                  >
                    <option value="">Select a project</option>
                    {availableProjects.map((project) => (
                      <option key={project._id} value={project._id}>
                        {project.projectId} - {project.title}
                      </option>
                    ))}
                  </select>
                </label>
              ) : (
                <label className="profile-edit-field">
                  <span>Project Name</span>
                  <input className="input" value={projectForm.name} disabled />
                </label>
              )}

              <label className="profile-edit-field">
                <span>Start Date *</span>
                <input
                  className="input"
                  type="date"
                  value={projectForm.startDate}
                  onChange={(event) =>
                    setProjectForm((previous) => ({ ...previous, startDate: event.target.value }))
                  }
                />
              </label>

              <label className="profile-edit-field">
                <span>End Date</span>
                <input
                  className="input"
                  type="date"
                  value={projectForm.endDate}
                  onChange={(event) =>
                    setProjectForm((previous) => ({ ...previous, endDate: event.target.value }))
                  }
                  min={projectForm.startDate}
                />
              </label>
            </div>

            <div className="admin-modal-actions">
              <button
                className="fiori-button secondary"
                onClick={() => {
                  setShowProjectModal(false);
                  setSelectedProjectId("");
                }}
              >
                Cancel
              </button>
              <button
                className="fiori-button primary"
                onClick={saveProject}
                disabled={!selectedProjectId && !projectForm._id}
              >
                {projectForm._id ? "Update" : "Assign"}
              </button>
            </div>
          </div>
        </div>
      )}

      {message && (
        <div
          className={`admin-toast ${
            message.toLowerCase().includes("error") || message.toLowerCase().includes("failed")
              ? "is-error"
              : "is-success"
          }`}
        >
          {message}
        </div>
      )}
    </section>
  );
};

export default Profile;
