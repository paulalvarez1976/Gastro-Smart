# Etapa 1: Build de la aplicación frontend
FROM node:20-alpine AS builder

WORKDIR /app

# Copiar archivos de dependencias
COPY package*.json ./

# Instalar todas las dependencias para compilar
RUN npm install

# Copiar código fuente
COPY . .

# Compilar frontend con Vite (genera /app/dist)
RUN npm run build

# Etapa 2: Runtime de producción
FROM node:20-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000

# Copiar archivos de dependencias e instalar solo las de producción
COPY package*.json ./
RUN npm install --omit=dev

# Copiar archivos estáticos compilados y el servidor Express
COPY --from=builder /app/dist ./dist
COPY server.js ./

# Exponer el puerto configurado
EXPOSE 3000

# Ejecutar servidor de producción
CMD ["node", "server.js"]
