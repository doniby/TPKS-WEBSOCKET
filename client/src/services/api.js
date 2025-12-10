import axios from "axios";
import config from "../config";

const API_BASE_URL = `${config.apiUrl}/api`;

// Create axios instance with default config
const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    "Content-Type": "application/json",
  },
});

// Add auth token to requests
api.interceptors.request.use((config) => {
  const token = localStorage.getItem("adminToken");
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Handle auth errors
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      // Token expired or invalid
      localStorage.removeItem("adminToken");
      window.location.href = "/login";
    }
    return Promise.reject(error);
  }
);

// --- AUTHENTICATION ---
export const authAPI = {
  login: (username, password) =>
    axios.post(`${API_BASE_URL}/admin/login`, { username, password }),

  verify: () => api.get("/admin/verify"),
};

// --- EVENTS ---
export const eventsAPI = {
  getAll: () => api.get("/admin/events"),

  getById: (id) => api.get(`/admin/events/${id}`),

  create: (data) =>
    api.post("/admin/events", {
      eventName: data.eventName,
      q: btoa(data.sqlQuery),
      intervalSeconds: data.intervalSeconds,
    }),

  update: (id, data) =>
    api.put(`/admin/events/${id}`, {
      eventName: data.eventName,
      q: btoa(data.sqlQuery),
      intervalSeconds: data.intervalSeconds,
    }),

  delete: (id) => api.delete(`/admin/events/${id}`),

  toggle: (id) => api.patch(`/admin/events/${id}/toggle`),

  testQuery: (sql) => api.post("/admin/run", { q: btoa(sql) }),
};

// --- MONITORING ---
export const monitoringAPI = {
  getStats: () => api.get("/monitoring/stats"),

  getEventStats: () => api.get("/monitoring/events"),

  getEventStatsById: (id) => api.get(`/monitoring/events/${id}`),

  getHealth: () => axios.get("/health"),
};

export default api;
