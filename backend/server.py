from flask import Flask, request
from flask_socketio import SocketIO, emit
from flask_cors import CORS

import duckdb
from datetime import datetime
import json

app = Flask(__name__)
CORS(app)  # Enable CORS for all domains
socketio = SocketIO(app, cors_allowed_origins="*")


# Connect to an in-memory DuckDB instance (or to a file by passing a filename)
con = duckdb.connect(':memory:')

# Execute the SQL commands to create tables
con.execute('''
CREATE TABLE roles (
    role_id INTEGER PRIMARY KEY,
    role_name VARCHAR,
    description TEXT
);

CREATE TABLE persons (
    person_id VARCHAR PRIMARY KEY,
    name VARCHAR,
    role_id INTEGER REFERENCES roles(role_id)
);

CREATE TABLE cases (
    case_id INTEGER PRIMARY KEY,
    title VARCHAR,
    description TEXT,
    status VARCHAR,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    resolved_at TIMESTAMP,
    closed_at TIMESTAMP,
    priority VARCHAR,
    created_by VARCHAR REFERENCES persons(person_id),
    assigned_to VARCHAR REFERENCES persons(person_id),
    resolved_by VARCHAR REFERENCES persons(person_id),
    closed_by VARCHAR REFERENCES persons(person_id)
);

CREATE TABLE persons_info (
    person_id VARCHAR REFERENCES persons(person_id), -- Corrected foreign key reference
    role TEXT,
    first_name VARCHAR,
    last_name VARCHAR,
    middle_name VARCHAR,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    description TEXT
);


CREATE TABLE schedules (
    schedule_id VARCHAR PRIMARY KEY,
    case_id INTEGER REFERENCES cases(case_id),
    person_id VARCHAR REFERENCES persons(person_id),
    start_time TIMESTAMP,
    end_time TIMESTAMP,
    description TEXT,
    status TEXT
);

CREATE TABLE proceedings (
    proceeding_id BIGINT PRIMARY KEY,
    case_id INTEGER REFERENCES cases(case_id),
    start_time TIMESTAMP,
    end_time TIMESTAMP,
    date DATE,
    summary TEXT,
    content TEXT,
    people_count INTEGER,
    date_created TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    date_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    status VARCHAR
);

CREATE TABLE proceeding_participants (
    proceeding_id BIGINT REFERENCES proceedings(proceeding_id),
    person_id VARCHAR,
    name VARCHAR,
    role VARCHAR,
    PRIMARY KEY (proceeding_id, person_id)
);

CREATE TABLE proceeding_schedules (
    proceeding_id BIGINT REFERENCES proceedings(proceeding_id),
    schedule_id VARCHAR REFERENCES schedules(schedule_id),
    PRIMARY KEY (proceeding_id, schedule_id)
);

CREATE TABLE resolutions (
    resolution_id INTEGER PRIMARY KEY,
    case_id INTEGER REFERENCES cases(case_id),
    title VARCHAR,
    content TEXT,
    resolved_at TIMESTAMP
);
''')

print("Tables created successfully.")
def get_next_id(con, table_name, id_column):
    result = con.execute(f"SELECT COALESCE(MAX({id_column}), 0) + 1 FROM {table_name}").fetchone()
    return result[0]

# Example: Insert into cases
def create_case(data):
    case_id = get_next_id(con, "cases", "case_id")
    con.execute("""
        INSERT INTO cases (
            case_id, title, description, priority, status,
            created_by, assigned_to, resolved_by, closed_by,
            resolved_at, closed_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, (
        case_id,
        data['title'],
        data['description'],
        data['priority'],
        data['status'],
        None,  # created_by
        None,  # assigned_to
        None,  # resolved_by
        None,  # closed_by
        None,  # resolved_at
        None   # closed_at
    ))

    created_case = {
        "status": data["status"],
        "case_id": case_id,
        "title": data["title"],
        "description": data["description"],
        "priority": data["priority"]
    }

    print("Created case ID:", created_case)
    return created_case

from datetime import datetime, date

def normalize_timestamp(value, _date=None):
    # If value is None, but _date is given → return _date at 00:00:00
    if not value:
        if _date:
            if isinstance(_date, date):
                return datetime.combine(_date, datetime.min.time())
            if isinstance(_date, str):
                try:
                    return datetime.fromisoformat(_date + "T00:00:00")
                except ValueError:
                    return None
        return None

    # Try full timestamp first
    try:
        return datetime.fromisoformat(value)
    except ValueError:
        pass

    # Handle time-only input, attach _date
    try:
        if not _date:
            _date = date.today()
        elif isinstance(_date, date):
            _date = _date.isoformat()

        full_ts = f"{_date} {value}:00" if len(value.split(":")) == 2 else f"{_date} {value}"
        return datetime.fromisoformat(full_ts)
    except ValueError:
        return None

            
def ensure_case_exists(case_id):
    if not con.execute("SELECT 1 FROM cases WHERE case_id = ?", (case_id,)).fetchone():
        raise ValueError(f"Invalid case_id: {case_id}")

def generate_schedule_id(person_id, timestamp):
    ts = normalize_timestamp(timestamp)
    ts_str = ts.strftime("%Y%m%d%H%M%S%f") if ts else "00000000000000"
    return f"{person_id}_{ts_str}"

def create_proceeding(data):
    ensure_case_exists(data.get('caseId'))
    con.execute("""
        INSERT INTO proceedings (
            proceeding_id, case_id, start_time, end_time, summary, content, people_count, date_created, date_updated, status
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, (
        data.get('id', None),
        data.get('caseId', None),
        normalize_timestamp(data.get('startTime'), data.get('date')),
        normalize_timestamp(data.get('endTime'), data.get('date')),
        data.get('summary', None),
        data.get('content', None),
        len(data.get("participants", []) or []),
        normalize_timestamp(None, data.get('dateCreated')),
        normalize_timestamp(None, data.get('dateUpdated')),
        data.get('status', None)
    ))

    participants = data.get("participants", []) or []
    participants_data = [
        (
            data.get("id", None),
            participant.get("name", None),
            participant.get("name", None),
            participant.get("role", None)
        )
        for participant in participants
    ]

    if participants_data:
        con.executemany("""
            INSERT INTO proceeding_participants (proceeding_id, person_id, name, role)
            VALUES (?, ?, ?, ?)
        """, participants_data)
    
    for participant in participants:
        person_id = participant.get("id")
        if not person_id:
            continue

        schedule_id = generate_schedule_id(person_id, data.get("startTime"))

        con.execute("""
            INSERT INTO schedules (
                schedule_id, case_id, person_id, start_time, end_time, description, status
            )
            VALUES (?, ?, ?, ?, ?, ?, ?)
        """, (
            schedule_id,
            data.get("caseId"),
            person_id,
            normalize_timestamp(data.get("startTime"), data.get('date')),
            normalize_timestamp(data.get("endTime"), data.get('date')),
            f"Proceeding {data.get('id')} schedule",
            "scheduled"
        ))

    print("Created proceeding ID:", data.get('id', None))
    return data.get('id', None)


def update_proceeding(data):
    con.execute("""
        UPDATE proceedings
        SET
            case_id = ?,             -- 2nd param
            start_time = ?,          -- 3rd
            end_time = ?,            -- 4th
            summary = ?,             -- 5th
            content = ?,             -- 6th
            people_count = ?,        -- 7th
            date_created = ?,        -- 8th
            date_updated = ?,        -- 9th
            status = ?               -- 10th
        WHERE proceeding_id = ?      -- 1st param
    """, (
        data.get('caseId'),
        normalize_timestamp(data.get('startTime'), data.get('date')),
        normalize_timestamp(data.get('endTime'), data.get('date')),
        data.get('summary'),
        data.get('content'),
        len(data.get('participants') or []),
        normalize_timestamp(None, data.get('dateCreated')),
        normalize_timestamp(None, data.get('dateUpdated')),
        data.get('status'),
        data.get('id')  # proceeding_id as WHERE clause
    ))
    

    # First delete old participants (single statement, not executemany)
    con.execute("""
        DELETE FROM proceeding_participants
        WHERE proceeding_id = ?
    """, (data['id'],))

    # Then insert updated participants
    participants_data = [
        (data["id"], participant["id"], participant["name"], participant["role"])
        for participant in data["participants"]
    ]

    con.executemany("""
        INSERT INTO proceeding_participants (proceeding_id, person_id, name, role)
        VALUES (?, ?, ?, ?)
    """, participants_data)

    print("Updated proceeding ID:", data['id'])
    return data.get('id', None)

def delete_case(data):
    #Delete all schedules associated with the case
    con.execute("""
        DELETE FROM schedules
        WHERE case_id =?
    """, (data['case_id'],))

    #Delete all proceedings associated with the case
    con.execute("""
        DELETE FROM proceeding_participants
        WHERE proceeding_id IN (
            SELECT proceeding_id FROM proceedings WHERE case_id =?
        )
    """, (data['case_id'],))

    con.execute("""
        DELETE FROM proceeding_schedules
        WHERE proceeding_id IN (
            SELECT proceeding_id FROM proceedings WHERE case_id =?
        )
    """, (data['case_id'],))

    con.execute("""
        DELETE FROM proceedings
        WHERE case_id =?
    """, (data['case_id'],))

    con.execute("""
        DELETE FROM cases
        WHERE case_id =?
    """, (data['case_id'],))
       
    print("Deleted case ID:", data['case_id'])
    return data.get('case_id', None)

def delete_proceeding(data):
    con.execute("""
        DELETE FROM proceeding_participants
        WHERE proceeding_id =?
    """, (data['id'],))

    con.execute("""
        DELETE FROM proceeding_schedules
        WHERE proceeding_id =?
    """, (data['id'],))

    con.execute("""
        DELETE FROM proceedings
        WHERE proceeding_id =?
    """, (data['id'],))

    print("Deleted proceeding ID:", data['id'])
    return data.get('id', None)
# Example usage:
# con = duckdb.connect('my_database.duckdb')
#case_id = create_case(con, "Case A", "Investigate client complaint")
#print(f"New case ID: {case_id}")
def fetchProceedings(data):
    con.execute("""
        SELECT
            proceeding_id,
            case_id,
            start_time,
            end_time,
            summary,
            content,
            people_count,
            date_created,
            date_updated,
            status
        FROM proceedings
        WHERE case_id = ?
    """, (data['case_id'],))

    rows = con.fetchall()
    proceedings = []

    for row in rows:
        proceeding_id = row[0]
        con.execute("""
            SELECT person_id, name, role
            FROM proceeding_participants
            WHERE proceeding_id = ?
        """, (proceeding_id,))
        participants = [
            {
                "id": p[0],
                "name": p[1],
                "role": p[2]
            }
            for p in con.fetchall()
        ]

        # Convert all datetime fields to ISO format strings
        proceedings.append({
            "id": row[0],
            "caseId": row[1],
            "startTime": row[2].isoformat() if row[2] else None,
            "endTime": row[3].isoformat() if row[3] else None,
            "summary": row[4],
            "content": row[5],
            "participants": participants,
            "date": row[2].date().isoformat() if row[2] else None,
            "dateCreated": row[7].isoformat() if row[7] else None,
            "dateUpdated": row[8].isoformat() if row[8] else None,
            "status": row[9]
        })

    print(proceedings)
    return proceedings



def get_all_schedules_for_person(con, person_id):
    query = """
    SELECT 
        s.schedule_id,
        s.start_time,
        s.end_time,
        s.description,
        ps.proceeding_id,
        p.case_id
    FROM schedules s
    LEFT JOIN proceeding_schedules ps ON ps.schedule_id = s.schedule_id
    LEFT JOIN proceedings p ON ps.proceeding_id = p.proceeding_id
    WHERE s.person_id = ?
    ORDER BY s.start_time;
    """
    
    rows = con.execute(query, (person_id,)).fetchall()
    
    result = [
        {
            "schedule_id": row[0],
            "start_time": str(row[1]),
            "end_time": str(row[2]),
            "description": row[3],
            "proceeding_id": row[4],
            "case_id": row[5]
        }
        for row in rows
    ]
    
    return json.dumps(result, indent=2)

# Example usage:
# print(get_all_schedules_for_person(con, person_id=1))
# Helper function to ensure person exists
def ensure_person_exists(con, person_id, name="Unnamed"):
    existing = con.execute("SELECT 1 FROM persons WHERE person_id = ?", (person_id,)).fetchone()
    if not existing:
        con.execute("INSERT INTO persons (person_id, name) VALUES (?, ?)", (person_id, name))

# Function to insert a proceeding with participants and their schedules
def add_proceeding_with_participants(con, case_id, summary, content, participants):
    con.execute("""
        INSERT INTO proceedings (proceeding_id, case_id, timestamp, summary, content) 
        VALUES ((SELECT COALESCE(MAX(proceeding_id), 0) + 1 FROM proceedings), ?, CURRENT_TIMESTAMP, ?, ?)
    """, (case_id, summary, content))
    proceeding_id = con.execute("SELECT MAX(proceeding_id) FROM proceedings").fetchone()[0]

    for p in participants:
        person_id = p['person_id']
        role = p.get('role', None)
        schedule = p.get('schedule', None)

        # Ensure person exists
        ensure_person_exists(con, person_id, p.get("name", f"Person {person_id}"))

        schedule_id = None
        if schedule:
            con.execute("""
                INSERT INTO schedules (schedule_id, case_id, person_id, start_time, end_time, description)
                VALUES ((SELECT COALESCE(MAX(schedule_id), 0) + 1 FROM schedules), ?, ?, ?, ?, ?)
            """, (
                case_id,
                person_id,
                schedule['start_time'],
                schedule['end_time'],
                schedule.get('description', None)
            ))
            schedule_id = con.execute("SELECT MAX(schedule_id) FROM schedules").fetchone()[0]

        con.execute("""
            INSERT INTO proceeding_participants (proceeding_id, person_id, role)
            VALUES (?, ?, ?)
        """, (proceeding_id, person_id, role))

        if schedule_id:
            con.execute("""
                INSERT INTO proceeding_schedules (proceeding_id, schedule_id)
                VALUES (?, ?)
            """, (proceeding_id, schedule_id))

    return proceeding_id

def get_case_proceedings_json(con, case_id):
    query = """
    SELECT 
        p.proceeding_id,
        p.summary,
        p.timestamp,
        json_group_array(
            json_object(
                'person_id', pp.person_id,
                'name', persons.name,
                'role', pp.role,
                'schedules', (
                    SELECT json_group_array(
                        json_object(
                            'schedule_id', s.schedule_id,
                            'start_time', s.start_time,
                            'end_time', s.end_time,
                            'description', s.description
                        )
                    )
                    FROM proceeding_schedules ps
                    JOIN schedules s ON ps.schedule_id = s.schedule_id
                    WHERE ps.proceeding_id = p.proceeding_id
                      AND s.person_id = pp.person_id
                )
            )
        ) AS participants_json
    FROM proceedings p
    JOIN proceeding_participants pp ON p.proceeding_id = pp.proceeding_id
    JOIN persons ON pp.person_id = persons.person_id
    WHERE p.case_id = ?
    GROUP BY p.proceeding_id, p.summary, p.timestamp
    ORDER BY p.proceeding_id;
    """

    rows = con.execute(query, (case_id,)).fetchall()

    result = []
    for row in rows:
        proceeding_id, summary, timestamp, participants_json = row
        participants = json.loads(participants_json) if participants_json else []
        result.append({
            'proceeding_id': proceeding_id,
            'summary': summary,
            'timestamp': str(timestamp),
            'participants': participants
        })

    return json.dumps(result, indent=2)

def fetchCases(data=None):
    query = "SELECT case_id, title, description, priority, status FROM cases"
    rows = con.execute(query).fetchall()
    cases = [
        {
            'case_id': row[0],
            'title': row[1],
            'description': row[2],
            'priority': row[3],
            'status': row[4]
        }
        for row in rows
    ]
    print("Emitting ", cases)
    return cases
# (Assume tables created already...)

# Example data
case_id = 1  # existing case id

participants = [
    {
        'person_id': 1,
        'role': 'Lead Lawyer',
        'schedule': {
            'start_time': datetime(2025, 5, 21, 9, 0),
            'end_time': datetime(2025, 5, 21, 10, 0),
            'description': 'Meeting with client'
        }
    },
    {
        'person_id': 2,
        'role': 'Assistant',
        # no schedule for this participant
    }
]

#proceeding_id = add_proceeding_with_participants(con, case_id, "Initial proceeding", "Discussed case details", participants)
#print("Created proceeding ID:", proceeding_id)

# Usage:
#print(get_case_proceedings_json(con, case_id=1))
from threading import Lock

user_sid_map = {}
map_lock = Lock()

@socketio.on('register_user')
def register_user(data):
    print(f"Received registration for user: {data['username']}")
    with map_lock:
        user_sid_map[data['username']] = request.sid

@socketio.on('connect')
def handle_connect():
    print("Client connected")
    emit('server_message', {'response': 'Connected to Flask server'})

@socketio.on('disconnect')
def on_disconnect():
    sid = request.sid
    # Remove any user associated with this SID
    for user, user_sid in list(user_sid_map.items()):
        if user_sid == sid:
            print(f"{user} disconnected")
            del user_sid_map[user]
            break

query_funcs = {
    1: create_case,
    2: fetchCases,
    3: create_proceeding,
    4: update_proceeding,
    5: get_case_proceedings_json,
    6: fetchProceedings,
    7: delete_proceeding,
    8: delete_case
}

@socketio.on('query_db')
def handle_client_message(data):
    print('Received from client:', data)
    output = query_funcs[data['query_id']](data["data"])
    # ✅ Only emit to the client who sent the message
    emit('server_message', {
        'query_id': data['query_id'],
        'data': output
    }, to=user_sid_map['user'])

    print("Emitted", {'query_id': data['query_id'], 'data': output}, "to SID:", user_sid_map['user'])

if __name__ == '__main__':
    socketio.run(app, host='0.0.0.0', port=5000)
