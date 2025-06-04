import duckdb
from datetime import datetime
import json

# Connect to an in-memory DuckDB instance (or to a file by passing a filename)
con = duckdb.connect(':memory:')

# Execute the SQL commands to create tables
con.execute('''
CREATE TABLE persons (
    person_id INTEGER PRIMARY KEY,
    name VARCHAR
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
    created_by INTEGER REFERENCES persons(person_id),
    assigned_to INTEGER REFERENCES persons(person_id),
    resolved_by INTEGER REFERENCES persons(person_id),
    closed_by INTEGER REFERENCES persons(person_id)
);

CREATE TABLE schedules (
    schedule_id INTEGER PRIMARY KEY,
    case_id INTEGER REFERENCES cases(case_id),
    person_id INTEGER REFERENCES persons(person_id),
    start_time TIMESTAMP,
    end_time TIMESTAMP,
    description TEXT
);

CREATE TABLE proceedings (
    proceeding_id INTEGER PRIMARY KEY,
    case_id INTEGER REFERENCES cases(case_id),
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    summary TEXT,
    content TEXT,
    people_count INTEGER,
    date_created TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    date_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    status VARCHAR
);

CREATE TABLE proceeding_participants (
    proceeding_id INTEGER REFERENCES proceedings(proceeding_id),
    person_id INTEGER REFERENCES persons(person_id),
    role VARCHAR,
    PRIMARY KEY (proceeding_id, person_id)
);

CREATE TABLE proceeding_schedules (
    proceeding_id INTEGER REFERENCES proceedings(proceeding_id),
    schedule_id INTEGER REFERENCES schedules(schedule_id),
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
def create_case(con, title, description):
    case_id = get_next_id(con, "cases", "case_id")
    con.execute("INSERT INTO cases (case_id, title, description) VALUES (?, ?, ?)",
                (case_id, title, description))
    return case_id

# Example usage:
# con = duckdb.connect('my_database.duckdb')
#case_id = create_case(con, "Case A", "Investigate client complaint")
#print(f"New case ID: {case_id}")

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