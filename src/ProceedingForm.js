import React, { useState } from 'react';

const ProceedingForm = ({ proceeding, onSubmit, onCancel, registeredParticipants }) => {
  const [formData, setFormData] = useState(proceeding || {
    summary: '',
    content: '',
    participants: [],
    status: 'ongoing'
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    onSubmit({
      ...formData,
      dateUpdated: new Date().toISOString()
    });
  };

  // ... rest of the form implementation similar to the new proceeding form ...

  return (
    <form onSubmit={handleSubmit} className="proceeding-form">
      {/* Form fields same as in Proceedings.js */}
      <div className="form-actions">
        <button type="submit" className="submit-btn">
          {proceeding ? 'Update' : 'Create'}
        </button>
        <button 
          type="button" 
          onClick={onCancel}
          className="cancel-btn"
        >
          Cancel
        </button>
      </div>
    </form>
  );
};

export default ProceedingForm;