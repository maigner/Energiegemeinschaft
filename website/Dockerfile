# Use a Node.js base image
FROM node:23

# Set timezone to Europe/Vienna (Salzburg)
RUN apt-get update && apt-get install -y tzdata && \
    ln -fs /usr/share/zoneinfo/Europe/Vienna /etc/localtime && \
    echo "Europe/Vienna" > /etc/timezone && \
    dpkg-reconfigure -f noninteractive tzdata
ENV TZ=Europe/Vienna

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
