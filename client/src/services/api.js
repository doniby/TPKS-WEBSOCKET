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
  getAll: () => api.get("/events"),

  getById: (id) => api.get(`/events/${id}`),

  create: (data) => api.post("/events", data),

  update: (id, data) => api.put(`/events/${id}`, data),

  delete: (id) => api.delete(`/events/${id}`),

  toggle: (id) => api.patch(`/events/${id}/toggle`),

  testQuery: (sql) => api.post("/admin/run", { sql }),
};

// --- MONITORING ---
export const monitoringAPI = {
  getStats: () => api.get("/monitoring/stats"),

  getEventStats: () => api.get("/monitoring/events"),

  getEventStatsById: (id) => api.get(`/monitoring/events/${id}`),

  getHealth: () => axios.get("/health"),
};

export default api;
