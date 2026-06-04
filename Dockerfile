FROM node:20-slim

# Create app directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install production dependencies
RUN npm install --omit=dev

# Copy source code
COPY emulator.js server.js ./
COPY extensions ./extensions

# Environment variables
ENV PORT=7860
ENV EXTENSIONS_DIR=/app/extensions

# Set permissions for Hugging Face UID 1000
RUN chown -R 1000:1000 /app

USER 1000

EXPOSE 7860

CMD ["node", "server.js"]
