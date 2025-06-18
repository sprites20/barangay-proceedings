import React, { useState, useEffect } from 'react';
import './CaseManager.css';
import Proceedings from './Proceedings';
import { io } from 'socket.io-client';



const CaseManager = () => {
  const [cases, setCases] = useState([]);
  const [selectedCase, setSelectedCase] = useState(null);
  const [showProceedings, setShowProceedings] = useState(false);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [proceedings, setProceedings] = useState([]);
  const socket = io('http://localhost:5000');
  const [newCase, setNewCase] = useState({
    case_id: null,
    title: '',
    description: '',
    priority: 'medium',
    status: 'open'
  });
  const [recievedCase, setRecievedCase] = useState({
    case_id: null,
    title: '',
    description: '',
    priority:'medium',
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
  
  const processes = {
    1: (data) => {
      console.log('Received case creation response:', data);
      setRecievedCase(data);
      setCases(prev => [...prev, data]);
      console.log('New case created:', data);
      setNewCase({
          title: '',
          description: '',
          priority: 'medium',
          status: 'open'
      });
      setShowCreateForm(false);
    },
    2: (data) => {
      setCases(data);
      console.log('Received cases:', data);
    },
    6: (data) => {
      console.log('Received proceedings:', data);
      setProceedings(data);
    },
  }
  const processMessage = (data) => {
    if (processes[data.query_id]) {
      processes[data.query_id](data.data);
    }
    else {
      console.log('Unknown query_id:', data.query_id);
    }
  }
  var fetchedCases = false;
  useEffect(() => {
    const handler = (data) => {
      console.log('Received message:', data);
      processMessage(data);
    };
  
    socket.on('connect', () => {
      console.log('Connected to server');
      console.log('Connected with ID:', socket.id);
      socket.emit('register_user', { username: 'user' });
  
      if (!fetchedCases) {
        socket.emit('query_db', { query_id: 2, data: {} });
        fetchedCases = true;
        console.log('Emitted query_db event');
      }
    });
  
    socket.on('disconnect', () => {
      console.log('Disconnected from server');
    });
  
    // ✅ Use the same handler reference
    socket.on('server_message', handler);
  
    return () => {
      socket.off('server_message', handler); // ✅ now actually removes it
    };
  }, []);
  

    const fetchProceedings = async () => {
      console.log('Fetching proceedings for case:', selectedCase.case_id);
      socket.emit('query_db', { query_id: 6, data: { case_id: selectedCase.case_id } });
    };
    const handleSubmit = async (e) => {
        e.preventDefault();
        try {
          // Here you would typically make an API call to create the case
          const createdCase = {
            ...newCase,
            status: 'open',
          };
          
          socket.emit('query_db', { query_id: 1, data: createdCase});
          console.log('Emitted query_db event', createdCase);

          
        } catch (error) {
            console.error("Error creating case:", error);
        }  
    };
    const handleDeleteCase = async (caseItem) => {
      try {
        console.log('Deleting case:', caseItem);
        
        // (Optional) Send to backend
        await socket.emit('query_db', { query_id: 8, data: { case_id: caseItem.case_id } });
        
        // Optimistically update the UI
        setCases(prevCases => prevCases.filter(c => c.case_id !== caseItem.case_id));
        
      } catch (error) {
        console.error("Error deleting case:", error);
      }
    }
    
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
              <button className="case-delete-button" onClick={() => handleDeleteCase(caseItem)} >
                Delete
              </button>
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
              onClick={async () => {
                console.log("Button clicked");
                await fetchProceedings(); // Wait for data
                setShowProceedings(true); // Then show the component
              }}
            >
              Show Proceedings
            </button>
          </div>
        </div>
      )}
      {showProceedings && selectedCase && (
        <Proceedings 
          socket={socket}
          caseId={selectedCase.case_id} 
          onClose={() => setShowProceedings(false)}
          proceedings_temp={proceedings}
        />
      )}
    </div>
  );
};

export default CaseManager;