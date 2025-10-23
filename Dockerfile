FROM node:18-alpine

# Install yt-dlp and ffmpeg
RUN apk add --no-cache \
    python3 \
    py3-pip \
    ffmpeg \
    && pip3 install --break-system-packages yt-dlp

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy source code
COPY . .

# Create temp directory
RUN mkdir -p /tmp

# Copy service account key (if it exists)
COPY google-service-account-key.json /app/google-service-account-key.json

# Expose port
EXPOSE 8080

# Start the application
CMD ["npm", "start"]
