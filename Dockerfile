# Use Node.js 22 Alpine image
FROM node:22-alpine

# Set working directory
WORKDIR /app

# Set npm cache to avoid conflicts
RUN npm config set cache /tmp/.npm-cache

# Copy package files
COPY package*.json ./

# Install dependencies with clean install
RUN npm ci --prefer-offline --no-audit

# Copy source code
COPY . .

# Build the application
RUN npm run build

# Expose port
EXPOSE 3000

# Start the application
CMD ["npm", "start"]