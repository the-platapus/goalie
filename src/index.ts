import express from 'express';
import { handleChatMessage, createSession } from './chatbot-service';

const app = express();
app.use(express.json());

const MOCK_PATIENT = {
  firstName: 'John',
  lastName: 'Doe',
  addressAs: 'Mr. Doe',
  age: 65,
  gender: 'Male',
  dob: '1958-01-01',
  phone: '555-555-5555',
  email: 'john.doe@example.com',
  practiceName: 'Main Street Clinic',
  providerName: 'Dr. Smith',
  programs: 'RPM, CCM',
  conditions: 'Hypertension, Diabetes',
  lastVisit: '2023-09-15',
  medications: 'Lisinopril 10mg, Metformin 500mg',
  vitals: 'BP 130/80',
  labs: 'HbA1c 7.0',
  allergies: 'Penicillin',
  diet: 'Low sodium',
  activity: 'Walk 30 mins daily',
  carePlan: 'Manage blood pressure and sugar levels',
  goals: 'Keep BP under 140/90',
  barriers: 'Forgets to take medication',
  symptoms: 'Occasional dizziness',
  appointments: '2023-10-15 with Dr. Smith',
  nextCheckinAt: '11/01, 10:00 AM CST',
  lastCheckin: 'Patient reported feeling well, taking meds.'
};

app.post('/api/session', (req, res) => {
  const { sessionId } = req.body;
  if (!sessionId) {
    return res.status(400).json({ error: 'sessionId is required' });
  }
  
  createSession(sessionId, MOCK_PATIENT);
  res.json({ message: 'Session created successfully.' });
});

app.post('/api/chat', async (req, res) => {
  const { sessionId, message } = req.body;

  if (!sessionId || !message) {
    return res.status(400).json({ error: 'sessionId and message are required' });
  }

  try {
    const reply = await handleChatMessage(sessionId, message);
    res.json({ reply });
  } catch (error: any) {
    console.error('Chat error:', error);
    res.status(500).json({ error: error.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
