FROM node:20-alpine AS webui-builder
WORKDIR /app/webui
COPY webui/package.json webui/package-lock.json ./
RUN npm ci
COPY webui/ ./
RUN npm run build

FROM node:20-alpine AS backend-builder
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json ./
COPY src/ ./src/
RUN npm run build
RUN npm ci --production

FROM node:20-alpine
WORKDIR /app
COPY --from=backend-builder /app/dist ./dist
COPY --from=backend-builder /app/node_modules ./node_modules
COPY --from=webui-builder /app/webui/dist ./webui/dist
COPY package.json ./
EXPOSE 3000
CMD ["node", "dist/index.js"]