# Use a Node.js base image
FROM node:20

# Set working directory
WORKDIR /app

# Copy package.json and package-lock.json
COPY package.json package-lock.json ./
COPY .env .env

# Install dependencies
RUN npm install

COPY . .

# Build the SvelteKit app
RUN npm run build

# Expose the port
EXPOSE 8080

# Start the SvelteKit app
CMD ["npm", "run", "start"]
