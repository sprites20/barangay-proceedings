import React, { useState, useEffect } from 'react';
import Calendar from 'react-calendar';
import 'react-calendar/dist/Calendar.css';
import './ScheduleTimeLine.css';
import { io } from 'socket.io-client';


const ScheduleTimeLine = () => {
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [selectedEvent, setSelectedEvent] = useState(null);
  const [deleteMode, setDeleteMode] = useState(false);
  const [people, setPeople] = useState([
    { name: 'Person 1', hidden: false },
  ]);
  const socket = io('http://localhost:5000');
  const processes = {
    
  }
  const processMessage = (data) => {
    if (processes[data.query_id]) {
      processes[data.query_id](data.data);
    }
    else {
      console.log('Unknown query_id:', data.query_id);
    }
  }
  
  useEffect(() => {
    const handler = (data) => {
      console.log('Received message:', data);
      processMessage(data);
    };
  
    socket.on('connect', () => {
      console.log('Connected to server');
      console.log('Connected with ID:', socket.id);
      socket.emit('register_user', { username: 'user' });
  
      
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
  // General events that can be reused
  const [events] = useState([
    {
      id: 'template_1',
      title: '1 Hour Event',
      duration: 60,
      type: 'template'
    },
    {
      id: 'template_2',
      title: '2 Hour Event',
      duration: 120,
      type: 'template'
    }
  ]);

  const [timelineEvents, setTimelineEvents] = useState({
    'Person 1': [],
  });

  const handleDateChange = (date) => {
    setSelectedDate(date);
    // Remove the reset of timeline events
  };

  // Filter timeline events for the selected date
  const getFilteredTimelineEvents = (personName) => {
    return timelineEvents[personName].filter(event => {
      const eventDate = new Date(event.startDateTime);
      return (
        eventDate.getFullYear() === selectedDate.getFullYear() &&
        eventDate.getMonth() === selectedDate.getMonth() &&
        eventDate.getDate() === selectedDate.getDate()
      );
    });
  };

  const handleDragStart = (e, event) => {
    e.dataTransfer.setData('eventId', event.id);
    e.dataTransfer.setData('eventType', event.type || 'scheduled');
    e.dataTransfer.setData('person', event.person || '');
  };

  const handleDragOver = (e) => {
    e.preventDefault();
  };

  const handleEventClick = (event) => {
    setSelectedEvent(event);
  };

  const updateEventTime = (newHours, newMinutes, duration) => {
    if (!selectedEvent) return;

    // Handle empty or invalid inputs
    const hours = newHours === '' || isNaN(newHours) ? 0 : parseInt(newHours);
    const minutes = newMinutes === '' || isNaN(newMinutes) ? 0 : parseInt(newMinutes);

    const startDate = new Date(selectedEvent.startDateTime);
    startDate.setHours(hours);
    startDate.setMinutes(minutes);

    const endDate = new Date(startDate);
    endDate.setMinutes(endDate.getMinutes() + duration);

    const updatedEvent = {
      ...selectedEvent,
      startDateTime: startDate.toISOString(),
      endDateTime: endDate.toISOString()
    };

    setTimelineEvents({
      ...timelineEvents,
      [selectedEvent.person]: timelineEvents[selectedEvent.person].map(event =>
        event.id === selectedEvent.id ? updatedEvent : event
      )
    });

    setSelectedEvent(updatedEvent);
  };

  const updateEventName = (newName) => {
    if (!selectedEvent) return;

    // Handle empty or invalid inputs
    const name = newName === '' || isNaN(newName) ? 'Untitled' : newName;
    const updatedEvent = {
      ...selectedEvent,
      title: newName,
    };

    setTimelineEvents({
      ...timelineEvents,
      [selectedEvent.person]: timelineEvents[selectedEvent.person].map(event =>
        event.id === selectedEvent.id ? updatedEvent : event
      )
    });

    setSelectedEvent(updatedEvent);
  };

  const handleDrop = (e, personName) => {
    e.preventDefault();
    const eventId = e.dataTransfer.getData('eventId');
    const eventType = e.dataTransfer.getData('eventType');
    const originalPerson = e.dataTransfer.getData('person');

    // Calculate position in timeline (rounded to 5 minutes)
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const totalMinutes = Math.floor((x / 100) * 60);
    const hours = Math.floor(totalMinutes / 60);
    const minutes = Math.round(totalMinutes % 60 / 5) * 5;

    if (eventType === 'template') {
      const templateEvent = events.find(event => event.id === eventId);
      if (templateEvent) {
        const startDate = new Date(selectedDate);
        startDate.setHours(hours, minutes, 0, 0);

        const endDate = new Date(startDate);
        endDate.setMinutes(endDate.getMinutes() + templateEvent.duration);

        const newEvent = {
          id: `${Date.now()}_${Math.random()}`,
          title: templateEvent.title,
          startDateTime: startDate.toISOString(),
          endDateTime: endDate.toISOString(),
          person: personName,
          duration: templateEvent.duration
        };
        
        //Emit the new schedule

        // Find and remove any existing event of same type for this person on this date
        const updatedEvents = (timelineEvents[personName] || []).filter(event => {
          const eventDate = new Date(event.startDateTime);
          return !(
            event.title === templateEvent.title &&
            event.duration === templateEvent.duration &&
            eventDate.getFullYear() === selectedDate.getFullYear() &&
            eventDate.getMonth() === selectedDate.getMonth() &&
            eventDate.getDate() === selectedDate.getDate()
          );
        });

        setTimelineEvents({
          ...timelineEvents,
          [personName]: [...updatedEvents, newEvent]
        });
      }
    } else if (eventType === 'scheduled') {
      // Handle moving existing events
      const existingEvent = (timelineEvents[originalPerson] || []).find(e => e.id === eventId);
      if (existingEvent) {
        const startDate = new Date(selectedDate);
        startDate.setHours(hours, minutes, 0, 0);

        const endDate = new Date(startDate);
        endDate.setMinutes(endDate.getMinutes() + existingEvent.duration);

        const updatedEvent = {
          ...existingEvent,
          startDateTime: startDate.toISOString(),
          endDateTime: endDate.toISOString(),
          person: personName
        };

        // Remove from original person and add to new person
        const sourceEvents = (timelineEvents[originalPerson] || []).filter(e => e.id !== eventId);
        const targetEvents = personName === originalPerson ? sourceEvents : (timelineEvents[personName] || []);

        setTimelineEvents({
          ...timelineEvents,
          [originalPerson]: sourceEvents,
          [personName]: [...targetEvents, updatedEvent]
        });
      }
    }
  };

  const handleDeleteEvent = (eventId, personName) => {
    if (deleteMode) {
      setTimelineEvents({
        ...timelineEvents,
        [personName]: (timelineEvents[personName] || []).filter(event => event.id !== eventId)
      });
      if (selectedEvent?.id === eventId) {
        setSelectedEvent(null);
      }
    }
  };

  const [recurringEvent, setRecurringEvent] = useState({
    title: 'Lunch Break',
    duration: 60,
    days: [],
    startTime: '12:00', // Default start time
    endTime: '13:00',    // Default end time
    weeksToApply: 4,     // Default weeks to apply
    specificDates: []    // Specific dates for events like holidays
  });

  // Function to handle changes in recurring event form
  const handleRecurringEventChange = (e) => {
    const { name, value, type, checked } = e.target;
    if (name === "days") {
      const dayValue = parseInt(value);
      setRecurringEvent(prevState => ({
        ...prevState,
        days: checked
          ? [...prevState.days, dayValue]
          : prevState.days.filter(day => day !== dayValue)
      }));
    } else if (name === "specificDates") {
      const dateValue = new Date(value);
      setRecurringEvent(prevState => ({
        ...prevState,
        specificDates: checked
          ? [...prevState.specificDates, dateValue]
          : prevState.specificDates.filter(date => date.getTime() !== dateValue.getTime())
      }));
    } else {
      setRecurringEvent(prevState => ({
        ...prevState,
        [name]: value
      }));
    }
  };

  const applyRecurringEventToAll = () => {
    people.forEach(person => applyRecurringEvent(person.name));
  };

  // Function to apply recurring events
  const applyRecurringEvent = (personName) => {
    const { weeksToApply, specificDates } = recurringEvent;
    const newEvents = [];

    // Apply for specified weeks
    for (let week = 0; week < weeksToApply; week++) {
      recurringEvent.days.forEach(day => {
        const startDate = new Date(selectedDate);
        startDate.setDate(startDate.getDate() + ((7 + day - startDate.getDay()) % 7) + (week * 7));

        const [startHours, startMinutes] = recurringEvent.startTime.split(':').map(Number);
        startDate.setHours(startHours, startMinutes, 0, 0);

        const endDate = new Date(startDate);
        const [endHours, endMinutes] = recurringEvent.endTime.split(':').map(Number);
        endDate.setHours(endHours, endMinutes, 0, 0);

        newEvents.push({
          id: `${Date.now()}_${Math.random()}`,
          title: recurringEvent.title,
          startDateTime: startDate.toISOString(),
          endDateTime: endDate.toISOString(),
          person: personName,
          duration: (endDate - startDate) / (1000 * 60) // Calculate duration in minutes
        });
      });
    }

    // Apply for specific dates
    specificDates.forEach(date => {
      const startDate = new Date(date);
      const [startHours, startMinutes] = recurringEvent.startTime.split(':').map(Number);
      startDate.setHours(startHours, startMinutes, 0, 0);

      const endDate = new Date(startDate);
      const [endHours, endMinutes] = recurringEvent.endTime.split(':').map(Number);
      endDate.setHours(endHours, endMinutes, 0, 0);

      newEvents.push({
        id: `${Date.now()}_${Math.random()}`,
        title: recurringEvent.title,
        startDateTime: startDate.toISOString(),
        endDateTime: endDate.toISOString(),
        person: personName,
        duration: (endDate - startDate) / (1000 * 60) // Calculate duration in minutes
      });
    });

    setTimelineEvents(prevTimelineEvents => ({
      ...prevTimelineEvents,
      [personName]: [...(prevTimelineEvents[personName] || []), ...newEvents]
    }));
  };

  const addPerson = () => {
    const newPersonName = `Person ${people.length + 1}`;
    setPeople([...people, { name: newPersonName, hidden: true }]);
    setTimelineEvents({
      ...timelineEvents,
      [newPersonName]: [] // Initialize empty array for new person's events
    });
  };

  const renamePerson = (index, newName) => {
    const updatedPeople = [...people];
    const oldName = updatedPeople[index].name;
    updatedPeople[index].name = newName;

    const updatedTimelineEvents = { ...timelineEvents };
    updatedTimelineEvents[newName] = updatedTimelineEvents[oldName];
    delete updatedTimelineEvents[oldName];

    setPeople(updatedPeople);
    setTimelineEvents(updatedTimelineEvents);
  };

  const deletePerson = (index) => {
    const personToDelete = people[index];
    const updatedPeople = people.filter((_, i) => i !== index);
    const updatedTimelineEvents = { ...timelineEvents };
    delete updatedTimelineEvents[personToDelete.name]; // Access the name property here

    setPeople(updatedPeople);
    setTimelineEvents(updatedTimelineEvents);
  };

  const createAndAddEvent = ({ title, person, date, startTime, endTime }) => {
    // Convert time strings to hours and minutes
    const [startHours, startMinutes] = startTime.split(':').map(Number);
    const [endHours, endMinutes] = endTime.split(':').map(Number);

    // Create start date
    const startDate = new Date(date);
    startDate.setHours(startHours, startMinutes, 0, 0);

    // Create end date
    const endDate = new Date(date);
    endDate.setHours(endHours, endMinutes, 0, 0);

    // Calculate duration in minutes
    const duration = (endDate - startDate) / (1000 * 60);

    // Create the event object
    const newEvent = {
      id: `${Date.now()}_${Math.random()}`,
      title,
      startDateTime: startDate.toISOString(),
      endDateTime: endDate.toISOString(),
      person,
      duration
    };

    // Add to timeline events
    setTimelineEvents(prevTimelineEvents => ({
      ...prevTimelineEvents,
      [person]: [...(prevTimelineEvents[person] || []), newEvent]
    }));

    return newEvent;
  };

  const [newSingleEvent, setNewSingleEvent] = useState({
    title: '',
    date: new Date().toISOString().split('T')[0], // Default to today's date in YYYY-MM-DD format
    startTime: '09:00', // Default start time
    endTime: '10:00',    // Default end time
    person: people.length > 0 ? people[0].name : '' // Default to the first person's name
  });

  const handleSingleEventChange = (e) => {
    const { name, value } = e.target;
    setNewSingleEvent(prevState => ({
      ...prevState,
      [name]: value
    }));
  };

  const handleSingleEventSubmit = (e) => {
    e.preventDefault();
    if (!newSingleEvent.title || !newSingleEvent.person) {
      alert('Please fill in event title and select a person.');
      return;
    }
    createAndAddEvent(newSingleEvent);
    // Optionally reset the form after submission
    setNewSingleEvent({
      title: '',
      date: new Date().toISOString().split('T')[0],
      startTime: '09:00',
      endTime: '10:00',
      person: people.length > 0 ? people[0].name : ''
    });
  };
  const [editingName, setEditingName] = useState({});
  return (
    <div className="schedule-container">
      <div className="sidebar">
        <div className="people-management">
          <button className="add-person-button" onClick={addPerson}>Add Person</button>
          <div className="people-selection">
            {people.map((person, index) => (
              <div key={person.name}> {/* Use person.name as key */}
                <input
                  type="text"
                  value={editingName[index] ?? person.name}
                  onChange={(e) =>
                    setEditingName(prev => ({ ...prev, [index]: e.target.value }))
                  }
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') e.target.blur();
                  }}
                  onBlur={() => {
                    const newName = editingName[index];
                    if (newName && newName !== person.name) {
                      renamePerson(index, newName);
                    }

                    // Clean up after rename or cancel
                    setEditingName(prev => {
                      const updated = { ...prev };
                      delete updated[index];
                      return updated;
                    });
                  }}
                />
                <button
                  onClick={() => {
                    // Toggle hidden state
                    const updatedPeople = [...people];
                    updatedPeople[index].hidden = !updatedPeople[index].hidden;
                    setPeople(updatedPeople);
                  }}
                  className="hide-person-button" // Renamed button class for clarity
                >
                  {person.hidden ? 'Show' : 'Hide'}
                </button>
                <button
                  className="update-person-button" // Renamed button class for clarity
                >
                  Update
                </button>
                <button
                  onClick={() => deletePerson(index)}
                  className="delete-person-button"
                >
                  Delete
                </button>
              </div>
            ))}
          </div>
        </div>
      
        <div className="calendar-container">
          <Calendar
            onChange={handleDateChange}
            value={selectedDate}
            className="custom-calendar"
          />
        </div>

        <div className="controls">
          <button
            className={`delete-mode ${deleteMode ? 'active' : ''}`}
            onClick={() => setDeleteMode(!deleteMode)}
          >
            {deleteMode ? 'Exit Delete Mode' : 'Enter Delete Mode'}
          </button>
        </div>

        {selectedEvent && (
          <div className="properties-panel">
            <h3>Event Properties</h3>
            <div className="event-title">
              <label>Event Name:</label>
              <input
                type="text"
                value={selectedEvent.title}
                onChange={(e) => {
                  const updatedEvent = {
                    ...selectedEvent,
                    title: e.target.value
                  };
                  setSelectedEvent(updatedEvent);
                  setTimelineEvents({
                    ...timelineEvents,
                    [selectedEvent.person]: timelineEvents[selectedEvent.person].map(event =>
                      event.id === selectedEvent.id ? updatedEvent : event
                    )
                  });
                }}
              />
            </div>
            <div className="time-controls">
              <div className="time-group">
                <h4>Start Time</h4>
                <div className="time-input">
                  <label>Hours:</label>
                  <input
                    type="number"
                    min="0"
                    max="23"
                    value={new Date(selectedEvent.startDateTime).getHours()}
                    onChange={(e) => {
                      const newHours = e.target.value === '' || isNaN(e.target.value) ? 0 : parseInt(e.target.value);
                      const startDate = new Date(selectedEvent.startDateTime);
                      const endDate = new Date(selectedEvent.endDateTime);
                      const duration = (endDate - startDate) / (1000 * 60); // in minutes
                      updateEventTime(newHours, startDate.getMinutes(), duration);
                    }}
                  />
                </div>
                <div className="time-input">
                  <label>Minutes:</label>
                  <input
                    type="number"
                    min="0"
                    max="59"
                    step="5"
                    value={new Date(selectedEvent.startDateTime).getMinutes()}
                    onChange={(e) => {
                      const newMinutes = e.target.value === '' || isNaN(e.target.value) ? 0 : parseInt(e.target.value);
                      const startDate = new Date(selectedEvent.startDateTime);
                      const endDate = new Date(selectedEvent.endDateTime);
                      const duration = (endDate - startDate) / (1000 * 60); // in minutes
                      updateEventTime(startDate.getHours(), newMinutes, duration);
                    }}
                  />
                </div>
              </div>
              <div className="time-group">
                <h4>End Time</h4>
                <div className="time-input">
                  <label>Hours:</label>
                  <input
                    type="number"
                    min="0"
                    max="23"
                    value={new Date(selectedEvent.endDateTime).getHours()}
                    onChange={(e) => {
                      const newHours = e.target.value === '' || isNaN(e.target.value) ? 0 : parseInt(e.target.value);
                      const startDate = new Date(selectedEvent.startDateTime);
                      const endDate = new Date(selectedEvent.endDateTime);
                      endDate.setHours(newHours);
                      const duration = (endDate - startDate) / (1000 * 60); // in minutes
                      if (duration > 0) {
                        updateEventTime(startDate.getHours(), startDate.getMinutes(), duration);
                      }
                    }}
                  />
                </div>
                <div className="time-input">
                  <label>Minutes:</label>
                  <input
                    type="number"
                    min="0"
                    max="59"
                    step="5"
                    value={new Date(selectedEvent.endDateTime).getMinutes()}
                    onChange={(e) => {
                      const newMinutes = e.target.value === '' || isNaN(e.target.value) ? 0 : parseInt(e.target.value);
                      const startDate = new Date(selectedEvent.startDateTime);
                      const endDate = new Date(selectedEvent.endDateTime);
                      endDate.setMinutes(newMinutes);
                      const duration = (endDate - startDate) / (1000 * 60); // in minutes
                      if (duration > 0) {
                        updateEventTime(startDate.getHours(), startDate.getMinutes(), duration);
                      }
                    }}
                  />
                </div>
              </div>
            </div>
          </div>
        )}

        <h2>Available Events</h2>
        <div className="events-table">
          <div className="template-events">
            {events.map(event => (
              <div
                key={event.id}
                draggable
                onDragStart={(e) => handleDragStart(e, event)}
                className="template-event"
              >
                <h3>{event.title}</h3>
                <p>Duration: {event.duration} minutes</p>
              </div>
            ))}
          </div>
        </div>
        <div className="recurring-event-form">
          <h3>Recurring Event</h3>
          <input
            type="text"
            name="title"
            value={recurringEvent.title}
            onChange={handleRecurringEventChange}
            placeholder="Event Title"
          />
          <input
            type="time"
            name="startTime"
            value={recurringEvent.startTime}
            onChange={handleRecurringEventChange}
          />
          <input
            type="time"
            name="endTime"
            value={recurringEvent.endTime}
            onChange={handleRecurringEventChange}
          />
          <input
            type="number"
            name="weeksToApply"
            value={recurringEvent.weeksToApply}
            onChange={handleRecurringEventChange}
            min="1"
            placeholder="Weeks to Apply"
          />
          <div className="recurring-days">
            {['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'].map((day, index) => (
              <label key={index} className="day-checkbox">
                <input
                  type="checkbox"
                  name="days"
                  value={index}
                  checked={recurringEvent.days.includes(index)}
                  onChange={handleRecurringEventChange}
                />
                {day}
              </label>
            ))}
          </div>
          <div className="recurring-person-buttons">
            {people.map(person => (
              <button
                key={person.name} // Use person.name as key
                onClick={() => applyRecurringEvent(person.name)} // Pass person.name
                className="apply-recurring-person-button"
              >
                Apply to {person.name}
              </button>
            ))}
            <button
              onClick={applyRecurringEventToAll}
              className="apply-recurring-button"
            >
              Apply to All Persons
            </button>
          </div>
        </div>
        <div className="single-event-form">
          <h3>Create Single Event</h3>
          <form onSubmit={handleSingleEventSubmit}>
            <input
              type="text"
              name="title"
              value={newSingleEvent.title}
              onChange={handleSingleEventChange}
              placeholder="Event Title"
              required
            />
            <input
              type="date"
              name="date"
              value={newSingleEvent.date}
              onChange={handleSingleEventChange}
              required
            />
            <input
              type="time"
              name="startTime"
              value={newSingleEvent.startTime}
              onChange={handleSingleEventChange}
              required
            />
            <input
              type="time"
              name="endTime"
              value={newSingleEvent.endTime}
              onChange={handleSingleEventChange}
              required
            />
            <select
              name="person"
              value={newSingleEvent.person}
              onChange={handleSingleEventChange}
              required
            >
              <option value="">Select Person</option>
              {people.map(person => (
                <option key={person.name} value={person.name}>{person.name}</option> // Use person.name for value and display
              ))}
            </select>
            <button type="submit">Add Event</button>
          </form>
        </div>
      </div>

      <div className="timeline" style={{ height: '1000px' }}>
        <h2>Timeline for {selectedDate.toDateString()}</h2>
        <div className="timeline-header">
          {Array.from({ length: 24 }, (_, i) => (
            <div key={i} className="time-label">
              {`${i.toString().padStart(2, '0')}:00`}
            </div>
          ))}
        </div>
        <div className="timeline-tracks">
          {people.filter(person => !person.hidden).map(person => ( // Filter hidden people
            <div key={person.name} className="track"> {/* Use person.name as key */}
              <div className="track-header">{person.name}</div> {/* Display person.name */}
              <div
                className="track-content"
                onDragOver={handleDragOver}
                onDrop={(e) => handleDrop(e, person.name)} // Pass person.name
              >
                {getFilteredTimelineEvents(person.name).map(event => ( // Pass person.name
                  <div
                    key={event.id}
                    className={`timeline-event ${selectedEvent?.id === event.id ? 'selected' : ''} ${deleteMode ? 'delete-mode' : ''}`}
                    style={{
                      left: `${(new Date(event.startDateTime).getHours() * 60 + new Date(event.startDateTime).getMinutes()) * (100 / 60)}px`,
                      width: `${(new Date(event.endDateTime) - new Date(event.startDateTime)) / (1000 * 60) * (100 / 60)}px`
                    }}
                    onClick={() => {
                      if (deleteMode) {
                        handleDeleteEvent(event.id, person.name); // Pass person.name
                      } else {
                        handleEventClick(event);
                      }
                    }}
                    draggable={!deleteMode}
                    onDragStart={(e) => handleDragStart(e, { ...event, person: person.name })} // Pass person.name
                  >
                    <div className="event-content">
                      <h3>{event.title}</h3>
                      <p>
                        {new Date(event.startDateTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} -
                        {new Date(event.endDateTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default ScheduleTimeLine;