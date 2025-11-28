# TPKS Dashboard WebSocket Server

A real-time WebSocket server with an admin dashboard for managing dynamic database-driven events. Built with Node.js, Express, Socket.IO, React, and Oracle Database.

## Features

- **Real-time WebSocket Broadcasting**: Broadcast database query results to connected clients at configurable intervals
- **Dynamic Event Management**: Create, edit, delete events without server restart
- **Query Testing**: Test SQL queries before deployment with execution time and preview
- **Admin Dashboard**: Modern React UI for managing events and monitoring server health
- **Security**: JWT authentication for WebSocket clients, admin login for dashboard
- **Rate Limiting**: Connection and request rate limiting
- **Health Monitoring**: Real-time metrics for WebSocket connections, database pool, and system resources
- **Oracle Database**: Full support for Oracle 11g+ with connection pooling

## Project Structure

```
tpksdashboardwebsocket/
├── server/                   # Backend (Node.js + Express + Socket.IO)
│   ├── config/
│   │   └── db.js            # Database connection pool
│   ├── middleware/
│   │   ├── auth.js          # WebSocket authentication
│   │   └── adminAuth.js     # Admin UI authentication
│   ├── services/
│   │   └── eventManager.js  # Dynamic event execution engine
│   ├── routes/
│   │   ├── api-auth.js      # Admin login API
│   │   ├── api-events.js    # Event CRUD + Test Query API
│   │   └── api-monitoring.js # Health & statistics API
│   ├── migrations/
│   │   └── 001-create-events.sql # Database schema
│   ├── utils/
│   │   └── generateToken.js # JWT token generator
│   └── server.js            # Main entry point
├── client/                   # Frontend (React + Vite)
│   ├── src/
│   │   ├── pages/           # Dashboard, Events, Monitoring, Login
│   │   ├── components/      # Reusable components
│   │   ├── services/        # API and WebSocket clients
│   │   ├── context/         # Authentication context
│   │   └── App.jsx
│   └── package.json
├── .env                      # Environment configuration
└── package.json             # Root package.json
```

## Prerequisites

- Node.js v14 or higher
- Oracle Database 11g or higher
- Oracle Instant Client (for Oracle DB connection)

## Setup Instructions

### 1. Database Setup

Run the migration script to create the EVENTS table:

```sql
-- Execute server/migrations/001-create-events.sql in your Oracle database
sqlplus username/password@database < server/migrations/001-create-events.sql
```

This creates:
- `EVENTS` table for storing event configurations
- Seeds the first event: "Vessel Alongside"

### 2. Backend Setup

```bash
# Navigate to project directory
cd tpksdashboardwebsocket

# Install dependencies
npm install

# Copy environment template
cp .env.example .env

# Edit .env with your configuration
nano .env  # or use your favorite editor
```

**Required .env Configuration:**

```env
# Database
DB_USER=your_oracle_username
DB_PASS=your_oracle_password
DB_HOST=localhost
DB_PORT=1521
DB_SID=ORCL
ORACLE_CLIENT_PATH=C:/oracle/instantclient_19_8  # Windows example

# Database Pool (for multiple events)
DB_POOL_MIN=5
DB_POOL_MAX=30

# Server
PORT=3000
NODE_ENV=development

# Security
JWT_SECRET=your-super-secret-jwt-key-CHANGE-THIS
API_KEY=your-api-key-for-public-websocket-clients
ALLOWED_ORIGINS=http://localhost:3000,http://localhost:5173

# Admin Credentials (Single Account)
ADMIN_USERNAME=admin
ADMIN_PASSWORD=YourSecurePassword123!

# Rate Limiting
RATE_LIMIT_POINTS=10
RATE_LIMIT_DURATION=1
MAX_CONNECTIONS=100
```

### 3. Frontend Setup

```bash
# Navigate to client directory
cd client

# Install dependencies
npm install
```

### 4. Running the Application

**Option 1: Development Mode (Recommended for testing)**

```bash
# Terminal 1: Start backend server
npm run dev:win    # Windows
# or
npm run dev        # Linux/Mac

# Terminal 2: Start React dev server
cd client
npm run dev
```

The admin dashboard will be available at: [http://localhost:5173](http://localhost:5173)

**Option 2: Production Mode**

```bash
# Build React app
cd client
npm run build
cd ..

# Set environment to production in .env
NODE_ENV=production

# Start server (serves both API and React app)
npm start
```

The admin dashboard will be available at: [http://localhost:3000/admin](http://localhost:3000/admin)

## Usage

### Admin Dashboard Login

1. Navigate to the admin UI (http://localhost:5173 in dev mode)
2. Login with credentials from .env:
   - Username: `admin` (or your ADMIN_USERNAME)
   - Password: Your ADMIN_PASSWORD

### Managing Events

1. **Create Event**:
   - Click "Create New Event"
   - Enter event name (e.g., "Vessel Alongside")
   - Paste your SQL query
   - Click "Test Query" to validate and get execution time
   - Set interval based on suggested value
   - Click "Create Event"

2. **Edit Event**:
   - Click "Edit" on any event
   - Modify name, query, or interval
   - Test query again if changed
   - Click "Update Event"

3. **Toggle Event**:
   - Click "Pause" to temporarily stop broadcasting
   - Click "Resume" to restart

4. **Delete Event**:
   - Click "Delete" and confirm

### Connecting WebSocket Clients (Public Dashboard)

Your frontend dashboard clients should connect using JWT or API key:

**Option 1: Using JWT Token**

```javascript
// Generate token first
// Run: node server/utils/generateToken.js user123 viewer

import { io } from 'socket.io-client';

const socket = io('http://localhost:3000', {
  auth: {
    token: 'your-jwt-token-here'
  }
});

// Listen to event broadcasts
socket.on('VESSEL_ALONGSIDE', (data) => {
  console.log('Vessel data:', data.data);
  console.log('Timestamp:', data.timestamp);
  console.log('Execution time:', data.executionTime, 'ms');
});
```

**Option 2: Using API Key**

```javascript
const socket = io('http://localhost:3000', {
  auth: {
    apiKey: 'your-api-key-from-env'
  }
});
```

### Event Channel Names

Events are broadcast on channels based on their names:
- "Vessel Alongside" → `VESSEL_ALONGSIDE`
- "Container Status" → `CONTAINER_STATUS`
- Spaces are replaced with underscores and converted to uppercase

### Monitoring

The Monitoring page shows:
- Active WebSocket connections
- Database connection pool usage
- Memory usage
- Event execution statistics
- Success/error rates
- Skipped executions (query overlap warnings)

## Query Testing Feature

The Query Tester helps you create optimal events:

1. **Execution Time**: Shows how long the query takes
2. **Row Count**: Number of rows returned
3. **Suggested Interval**: Automatic recommendation based on execution time
4. **Data Preview**: First 5 rows of results
5. **Warnings**: Alerts for slow queries or large result sets

**Example Test Results:**
```
✓ Execution Time: 230ms
✓ Rows Returned: 5
✓ Suggested Interval: ≥ 5 seconds
⚠ Warning: Query returned 1,250 rows. Consider limiting results.
```

## Security Considerations

1. **Change Default Credentials**: Update `JWT_SECRET`, `ADMIN_PASSWORD`, and `API_KEY` in .env
2. **SQL Injection Protection**: Only SELECT queries allowed, dangerous keywords blocked
3. **Rate Limiting**: Prevents brute force and DoS attacks
4. **CORS**: Configure ALLOWED_ORIGINS for production
5. **HTTPS**: Use HTTPS in production (place behind nginx/Apache)

## Troubleshooting

### Database Connection Failed
```
Error: ORA-12154: TNS:could not resolve the connect identifier specified
```
**Solution**: Check `DB_HOST`, `DB_PORT`, `DB_SID` in .env

### Oracle Client Init Failed
```
Error: Oracle Client Init Failed. Check ORACLE_CLIENT_PATH
```
**Solution**: Install Oracle Instant Client and set correct path in .env

### Events Not Broadcasting
- Check event is active (Status = "Active")
- Check database connection pool usage (Monitoring page)
- Check server logs for errors
- Verify SQL query is valid (use Test Query)

### Admin Login Failed
- Verify credentials match .env file
- Check JWT_SECRET is set correctly
- Clear browser localStorage and retry

## Performance Tips

1. **Optimize Queries**: Use indexes, limit result sets
2. **Adjust Intervals**: Don't set intervals shorter than query execution time
3. **Monitor Skips**: If "Skipped" count increases, query is too slow or interval too short
4. **Database Pool**: Increase `DB_POOL_MAX` if you have many concurrent events
5. **Memory**: Monitor heap usage in Monitoring page

## API Endpoints

### Admin Auth
- `POST /api/admin/login` - Admin login
- `GET /api/admin/verify` - Verify token

### Events
- `GET /api/events` - List all events
- `POST /api/events` - Create event
- `PUT /api/events/:id` - Update event
- `DELETE /api/events/:id` - Delete event
- `PATCH /api/events/:id/toggle` - Toggle active status
- `POST /api/events/test-query` - Test SQL query

### Monitoring
- `GET /api/monitoring/stats` - Server statistics
- `GET /api/monitoring/events` - Event execution stats
- `GET /health` - Health check

## License

ISC

## Support

For issues or questions, contact the development team or create an issue in the repository.
