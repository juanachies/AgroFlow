# AgroFlow: API + front (si está) en un solo contenedor.
FROM node:22.23.5-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install --no-audit --no-fund
COPY . .
# Compila el front (Vite) si el proyecto lo tiene; la API lo sirve desde dist/.
RUN npm run build --if-present
ENV NODE_ENV=production PORT=3000
EXPOSE 3000
CMD ["node", "src/interfaces/http/server.js"]
