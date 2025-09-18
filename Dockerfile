# Use Node.js 22 Alpine image
FROM node:22-alpine

# Set working directory
WORKDIR /app

# Declare build-time arguments for Vite environment variables
ARG VITE_SUPABASE_URL
ARG VITE_SUPABASE_ANON_KEY
ARG VITE_ADMIN_USER_ID
ARG VITE_APP_NAME
ARG VITE_APP_VERSION

# Set environment variables for the build process
ENV VITE_SUPABASE_URL=$VITE_SUPABASE_URL
ENV VITE_SUPABASE_ANON_KEY=$VITE_SUPABASE_ANON_KEY
ENV VITE_ADMIN_USER_ID=$VITE_ADMIN_USER_ID
ENV VITE_APP_NAME=$VITE_APP_NAME
ENV VITE_APP_VERSION=$VITE_APP_VERSION

# Set npm cache to avoid conflicts
RUN npm config set cache /tmp/.npm-cache

# Copy package files
COPY package*.json ./

# Install dependencies with clean install
RUN npm ci --prefer-offline --no-audit

# Copy source code
COPY . .

# Build the application (now with environment variables available)
RUN npm run build

# Expose port
EXPOSE 3000

# Start the application
CMD ["npm", "start"]