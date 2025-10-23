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

# Copy cookies file
COPY cookies.txt /app/cookies.txt

# Expose port
EXPOSE 8080

# Start the application
CMD ["npm", "start"]
