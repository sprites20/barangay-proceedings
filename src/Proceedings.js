import React, { useState, useEffect } from 'react';
import './Proceedings.css';


const Proceedings = ({ socket, caseId, onClose, proceedings_temp }) => {
  const [proceedings, setProceedings] = useState(proceedings_temp);
  const [selectedProceeding, setSelectedProceeding] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [formErrors, setFormErrors] = useState({});
  const [formData, setFormData] = useState({
    summary: '',
    content: '',
    participants: [],
    date: '',
	startTime: '',
	endTime: ''
  });
  const [peopleFormData, setPeopleFormData] = useState({
    name: '',
    role: '',
  });
  const [registeredParticipants, setRegisteredParticipants] = useState([
    { id: 1, name: 'Officer 1', role: 'Barangay Captain' },
    { id: 2, name: 'Officer 2', role: 'Secretary' },
    // Add more registered participants
  ]);
  //console.log(caseId);
  useEffect(() => {
    setProceedings(proceedings_temp);
  }, [JSON.stringify(proceedings_temp)]);
  const resetForm = () => {
    setFormData({
      summary: '',
      content: '',
      participants: [],
	  date: '',
	  startTime: '',
	  endTime: '',
    });
    setFormErrors({});
    setIsEditing(false);
    setShowForm(false);
    setSelectedProceeding(null);
  };

  const handleAddParticipant = (type) => {
    if (type === 'registered') {
      setFormData((prev) => ({
        ...prev,
        showParticipantSelect: true,
      }));
    } else {
      setFormData((prev) => ({
        ...prev,
        participants: [
          ...prev.participants,
          {
            id: Date.now(),
            name: '',
            role: '',
            type: 'unregistered',
          },
        ],
      }));
    }
  };

  const handleParticipantChange = (participantId, field, value) => {
    setFormData((prev) => ({
      ...prev,
      participants: prev.participants.map((p) =>
        p.id === participantId ? { ...p, [field]: value } : p
      ),
    }));
  };

  const validateForm = () => {
    const errors = {};
    if (!formData.summary.trim()) errors.summary = 'Summary is required.';
    if (!formData.content.trim()) errors.content = 'Content is required.';
    if (formData.startTime && formData.endTime && formData.startTime >= formData.endTime) {
      errors.time = 'Start time must be before end time.';
    }
    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };
  const handlePeopleSubmit = (e) => {
    e.preventDefault(); // prevents reload
    if (peopleFormData.name && peopleFormData.role) {
      setRegisteredParticipants((prev) => [
        ...prev,
        { id: peopleFormData.name, name: peopleFormData.name, role: peopleFormData.role },
      ]);
      setPeopleFormData({ name: "", role: "" }); // Clear form
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!validateForm()) return;
  
    const proceeding = {
      caseId: caseId,
      id: isEditing ? formData.id : String(Date.now()) + caseId,
      summary: formData.summary,
      content: formData.content,
      participants: formData.participants,
      startTime: formData.startTime,
      endTime: formData.endTime,
	    date: formData.date,
      dateCreated: isEditing ? formData.dateCreated : new Date().toISOString(),
      dateUpdated: new Date().toISOString(),
      status: 'ongoing',
    };

    //If editing update to the server
    //If not just create
    
    if (isEditing) {
      setProceedings((prev) =>
        prev.map((p) => (p.id === proceeding.id ? proceeding : p))
      );
      socket.emit('query_db', { query_id: 4, data: proceeding });
    } else {
      setProceedings((prev) => [...prev, proceeding]);
      socket.emit('query_db', { query_id: 3, data: proceeding });
    }

    resetForm();
  };

  const handleEdit = (proceeding) => {
    setFormData({ ...proceeding });
    setIsEditing(true);
    setShowForm(true);
  };

  const handleDelete = (id) => {
    if (window.confirm('Are you sure you want to delete this proceeding?')) {
      setProceedings((prev) => prev.filter((p) => p.id !== id));
      if (selectedProceeding && selectedProceeding.id === id) {
        setSelectedProceeding(null);
      }
    }
  };

  return (
    <div className="proceedings-container">
      <div className="proceedings-list">
        <div className="proceedings-header">
          <h2>Proceedings</h2>
          <button onClick={() => setShowForm(true)} className="new-proceeding-btn">
            New Proceeding
          </button>
        </div>
        <div className="proceedings-scroll-box">
          {proceedings.map((proc) => (
            <div
              key={proc.id}
              className={`proceeding-item ${
                selectedProceeding?.id === proc.id ? 'selected' : ''
              }`}
              onClick={() => setSelectedProceeding(proc)}
            >
              <div className="proceeding-summary">
                <h3>{proc.summary}</h3>
                <span className="participant-count">
                  {proc.participants.length} participants
                </span>
              </div>
              <div className="proceeding-dates">
                <span>Created: {new Date(proc.dateCreated).toLocaleDateString()}</span>
                <span>Updated: {new Date(proc.dateUpdated).toLocaleDateString()}</span>
              </div>
              <span className="proceeding-status">{proc.status}</span>
              <div className="proceeding-actions">
                <button onClick={(e) => { e.stopPropagation(); handleEdit(proc); }}>Edit</button>
                <button onClick={(e) => { e.stopPropagation(); handleDelete(proc.id); }}>Delete</button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {showForm && (
        <div className="proceeding-form-container">
          <h2>{isEditing ? 'Edit Proceeding' : 'New Proceeding'}</h2>
          <form onSubmit={handleSubmit} className="proceeding-form">
            <div className="form-group">
              <label>Summary:</label>
              <input
                type="text"
                value={formData.summary}
                onChange={(e) =>
                  setFormData((prev) => ({ ...prev, summary: e.target.value }))
                }
                required
              />
              {formErrors.summary && <span className="error">{formErrors.summary}</span>}
            </div>
            <div className="form-group">
              <label>Content:</label>
              <textarea
                value={formData.content}
                onChange={(e) =>
                  setFormData((prev) => ({ ...prev, content: e.target.value }))
                }
                rows="4"
                required
              />
              {formErrors.content && <span className="error">{formErrors.content}</span>}
            </div>
            <div className="form-group">
			  <label>Date:</label>
			  <input
				type="date"
				value={formData.date}
				onChange={(e) => setFormData(prev => ({ ...prev, date: e.target.value }))}
			  />
			</div>

			<div className="form-group">
			  <label>Start Time (optional):</label>
			  <input
				type="time"
				value={formData.startTime}
				onChange={(e) => setFormData(prev => ({ ...prev, startTime: e.target.value }))}
			  />
			</div>
			
			<div className="form-group">
			  <label>End Time (optional):</label>
			  <input
				type="time"
				value={formData.endTime}
				onChange={(e) => setFormData(prev => ({ ...prev, endTime: e.target.value }))}
			  />
			</div>
      <div className="register-people-section">
  <h3>Register People</h3>

  <div className="form-group">
    <label>Person Name:</label>
    <input
      type="text"
      name="name"
      placeholder="Full Name"
      value={peopleFormData.name}
      onChange={(e) =>
        setPeopleFormData({ ...peopleFormData, name: e.target.value })
      }
      
    />
  </div>

  <div className="form-group">
    <label>Role: </label>
    <input
      type="text"
      name="role"
      placeholder="Role"
      value={peopleFormData.role}
      onChange={(e) =>
        setPeopleFormData({ ...peopleFormData, role: e.target.value })
      }
      
    />
  </div>

  <button onClick={handlePeopleSubmit}>Register</button>
</div>

            <div className="participants-section">
              <h3>Participants</h3>

              <div className="participant-buttons">
                <button
                  type="button"
                  onClick={() => handleAddParticipant('registered')}
                  className="add-participant-btn"
                >
                  Add Registered Participant
                </button>

                <button
                  type="button"
                  onClick={() => handleAddParticipant('unregistered')}
                  className="add-participant-btn"
                >
                  Add Other Participant
                </button>
              </div>

              {formData.showParticipantSelect && (
                <div className="registered-participants-select">
                  <select
                    onChange={(e) => {
                      const selected = registeredParticipants.find(
                        (p) => p.id === Number(e.target.value)
                      );
                      if (selected) {
                        setFormData((prev) => ({
                          ...prev,
                          participants: [
                            ...prev.participants,
                            { ...selected, type: 'registered' },
                          ],
                          showParticipantSelect: false,
                        }));
                      }
                    }}
                  >
                    <option value="">Select a participant</option>
                    {registeredParticipants.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name} - {p.role}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {formData.participants.map((participant) => (
                <div key={participant.id} className="participant-entry">
                  {participant.type === 'unregistered' ? (
                    <>
                      <input
                        type="text"
                        placeholder="Name"
                        value={participant.name}
                        onChange={(e) =>
                          handleParticipantChange(participant.id, 'name', e.target.value)
                        }
                      />
                      <input
                        type="text"
                        placeholder="Role"
                        value={participant.role}
                        onChange={(e) =>
                          handleParticipantChange(participant.id, 'role', e.target.value)
                        }
                      />
                    </>
                  ) : (
                    <div className="registered-participant">
                      {participant.name} - {participant.role}
                    </div>
                  )}
                </div>
              ))}
            </div>

            <button type="submit" className="submit-proceeding-btn">
              {isEditing ? 'Update Proceeding' : 'Create Proceeding'}
            </button>
            <button type="button" onClick={resetForm} className="cancel-btn">
              Cancel
            </button>
          </form>
        </div>
      )}

	{selectedProceeding && !showForm && (
        <div className="proceeding-details">
          <h2>{selectedProceeding.summary}</h2>

          <div className="detail-group">
            <label>Status:</label>
            <span className="status-badge">{selectedProceeding.status}</span>
          </div>
          <div className="detail-group">
            <label>Created:</label>
            <span>{new Date(selectedProceeding.dateCreated).toLocaleString()}</span>
          </div>
          <div className="detail-group">
            <label>Updated:</label>
            <span>{new Date(selectedProceeding.dateUpdated).toLocaleString()}</span>
          </div>
          {selectedProceeding.startTime && selectedProceeding.endTime && (
            <div className="detail-group">
              <label>Schedule:</label>
              <span>
                {selectedProceeding.startTime} to {selectedProceeding.endTime}
              </span>
            </div>
          )}
          <div className="detail-group">
            <label>Content:</label>
            <p>{selectedProceeding.content}</p>
          </div>
          <div className="detail-group">
            <label>Schedule:</label>
            <p>{selectedProceeding.date} {selectedProceeding.startTime} to {selectedProceeding.endTime}</p>
          </div>
          <div className="detail-group">
            <label>Participants:</label>
            <ul className="participant-list">
              {selectedProceeding.participants.map((p, idx) => (
                <li key={idx}>
                  {p.name} - {p.role} ({p.type})
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

      <button className="close-btn" onClick={onClose}>
        Close
      </button>
    </div>
  );
};

export default Proceedings;
