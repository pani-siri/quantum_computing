import mongoose from "mongoose";

const userSchema = new mongoose.Schema({
  uid:       { type: String, required: true, unique: true, index: true },
  name:      { type: String, required: true },
  email:     { type: String, required: true, unique: true, index: true, lowercase: true, trim: true },
  password:  { type: String },          // hashed; absent for Google-only users
  created_at:{ type: Date, default: Date.now }
});

const agentSchema = new mongoose.Schema({
  id:      { type: String, required: true, unique: true, index: true },
  user_id: { type: String, required: true, index: true },
  data:    { type: mongoose.Schema.Types.Mixed, required: true }
});

const taskSchema = new mongoose.Schema({
  user_id: { type: String, required: true, index: true },
  tasks:   { type: mongoose.Schema.Types.Mixed, default: [] }
});

const scheduleSchema = new mongoose.Schema({
  user_id:  { type: String, required: true, index: true },
  schedule: { type: mongoose.Schema.Types.Mixed, default: [] }
});

const analyticsSchema = new mongoose.Schema({
  user_id:    { type: String, required: true, index: true },
  agent_id:   { type: String, index: true },
  event_type: { type: String, default: "session" },   // session, quiz, cognitive_load, resource_feedback
  data:       { type: mongoose.Schema.Types.Mixed, default: {} },
  timestamp:  { type: Date, default: Date.now }
});

export const User      = mongoose.model("User",      userSchema);
export const Agent     = mongoose.model("Agent",     agentSchema);
export const TaskDoc   = mongoose.model("Task",      taskSchema);
export const Schedule  = mongoose.model("Schedule",  scheduleSchema);
export const Analytics = mongoose.model("Analytics", analyticsSchema);
