import axios from "axios";

// Ensure required environment variables are set
if (!process.env.GONG_ACCESS_KEY || !process.env.GONG_SECRET) {
  console.error(
    "Error: GONG_ACCESS_KEY or GONG_SECRET environment variables are not set."
  );
  process.exit(1); // Exit if credentials are missing
}

// Create axios client with Basic Auth
const client = axios.create({
  baseURL: "https://api.gong.io",
  auth: {
    username: process.env.GONG_ACCESS_KEY,
    password: process.env.GONG_SECRET
  }
});

export default client; 