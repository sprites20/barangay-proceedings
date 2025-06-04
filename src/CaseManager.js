import React, { useState, useEffect } from 'react';
import './CaseManager.css';
import Proceedings from './Proceedings';
import { io } from 'socket.io-client';



const CaseManager = () => {
  const [cases, setCases] = useState([]);
  const [selectedCase, setSelectedCase] = useState(null);
  const [showProceedings, setShowProceedings] = useState(false);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const socket = io('http://localhost:5000');
  const [newCase, setNewCase] = useState({
    title: '',
    description: '',
    priority: 'medium',
    status: 'open'
  });

  // Status colors
  const statusColors = {
    open: '#28a745',    // green
    closed: '#dc3545',  // red
    pending: '#ffc107', // yellow
  };

  const handleCaseClick = (caseItem) => {
    setSelectedCase(caseItem);
    setShowProceedings(false);
    setShowCreateForm(false);
  };

  const handleCreateClick = () => {
    setSelectedCase(null);
    setShowCreateForm(true);
    setShowProceedings(false);
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setNewCase(prev => ({
      ...prev,
      [name]: value
    }));
  };

  useEffect(() => {
    socket.on('connect', () => {
      console.log('Connected to server');
    });
    socket.on('connect', () => {
      console.log('Connected to server');
    });
    socket.on('server_message', (message) => {
      console.log('Received message:', message);
    });
    return () => {
      socket.off('server_message');
    };
  }, []);


    useEffect(() => {
        const fetchCases = async () => {
            try {
                const response = await fetch('/api/cases'); // Adjust URL as needed
                if (!response.ok) {
                    throw new Error(`HTTP error! status: ${response.status}`);
                }
                const data = await response.json();
                setCases(data);
            } catch (error) {
                console.error("Error fetching cases:", error);
            }
        };

        fetchCases();
    }, []); // Empty dependency array means this runs once on mount
    const handleSubmit = async (e) => {
        e.preventDefault();
        try {
            const response = await fetch('/api/cases', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(newCase), // newCase state holds form data
            });
    
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
    
            const createdCase = await response.json();
            setCases([...cases, createdCase]); // Add the new case to the list
            setNewCase({ title: '', description: '', priority: 'low', status: 'open'});
            setShowCreateForm(false);
        } catch (error) {
            console.error("Error creating case:", error);

            e.preventDefault();
            // Here you would typically make an API call to create the case
            const createdCase = {
                ...newCase,
                case_id: Date.now(), // Temporary ID, should come from backend
                created_at: new Date().toISOString(),
            };
            setCases(prev => [...prev, createdCase]);
            console.log('New case created:', createdCase);
            socket.emit('query_db', { type: 1, data: createdCase});
            console.log('Emitted query_db event');
            setNewCase({
                title: '',
                description: '',
                priority: 'medium',
                status: 'open'
            });
            setShowCreateForm(false);
            };
    };

  return (
    <div className="case-manager">
      <div className="case-list">
        <div className="case-list-header">
          <h2>Cases</h2>
          <button className="create-case-btn" onClick={handleCreateClick}>
            Create New Case
          </button>
        </div>
        <div className="case-scroll-box">
          {cases.map((caseItem) => (
            <div
              key={caseItem.case_id}
              className={`case-item ${selectedCase?.case_id === caseItem.case_id ? 'selected' : ''}`}
              onClick={() => handleCaseClick(caseItem)}
            >
              <div className="case-header">
                <h3>{caseItem.title}</h3>
                <span 
                  className="case-status"
                  style={{ backgroundColor: statusColors[caseItem.status] }}
                >
                  {caseItem.status}
                </span>
              </div>
              <p className="case-description">
                {caseItem.description.length > 100
                  ? `${caseItem.description.substring(0, 100)}...`
                  : caseItem.description}
              </p>
            </div>
          ))}
        </div>
      </div>

      {showCreateForm && (
        <div className="case-sidebar">
          <h2>Create New Case</h2>
          <form onSubmit={handleSubmit} className="case-form">
            <div className="form-group">
              <label>Title:</label>
              <input
                type="text"
                name="title"
                value={newCase.title}
                onChange={handleInputChange}
                required
              />
            </div>
            <div className="form-group">
              <label>Description:</label>
              <textarea
                name="description"
                value={newCase.description}
                onChange={handleInputChange}
                rows="6"
                required
              />
            </div>
            <div className="form-group">
              <label>Priority:</label>
              <select
                name="priority"
                value={newCase.priority}
                onChange={handleInputChange}
              >
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
              </select>
            </div>
            <button type="submit" className="submit-case-btn">
              Create Case
            </button>
          </form>
        </div>
      )}

      {selectedCase && !showCreateForm && (
        <div className="case-sidebar">
          <h2>{selectedCase.title}</h2>
          <div className="case-details">
            <div className="detail-group">
              <label>Status:</label>
              <span 
                className="status-badge"
                style={{ backgroundColor: statusColors[selectedCase.status] }}
              >
                {selectedCase.status}
              </span>
            </div>
            <div className="detail-group">
              <label>Created:</label>
              <span>{new Date(selectedCase.created_at).toLocaleDateString()}</span>
            </div>
            <div className="detail-group">
              <label>Description:</label>
              <p>{selectedCase.description}</p>
            </div>
            <div className="detail-group">
              <label>Priority:</label>
              <span>{selectedCase.priority}</span>
            </div>
            <button 
              className="show-proceedings-btn"
              onClick={() => setShowProceedings(true)}
            >
              Show Proceedings
            </button>
          </div>
        </div>
      )}
      {showProceedings && selectedCase && (
        <Proceedings 
          caseId={selectedCase.case_id} 
          onClose={() => setShowProceedings(false)} 
        />
      )}
    </div>
  );
};

export default CaseManager;