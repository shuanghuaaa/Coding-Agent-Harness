FROM node:20-alpine AS webui-builder
RUN apk add --no-cache python3 make g++
WORKDIR /app/webui
COPY webui/package.json webui/package-lock.json webui/tsconfig.json ./
RUN npm ci
COPY webui/ ./
RUN npm run build

FROM node:20-alpine AS backend-builder
RUN apk add --no-cache python3 make g++ git sqlite-dev
WORKDIR /app
COPY package.json package-lock.json tsconfig.json ./
RUN npm ci
COPY src/ ./src/
RUN npm run build
RUN npm ci --production

FROM node:20-alpine
RUN apk add --no-cache sqlite-libs
WORKDIR /app
RUN mkdir -p /app/data
COPY --from=backend-builder /app/dist ./dist
COPY --from=backend-builder /app/node_modules ./node_modules
COPY --from=webui-builder /app/webui/dist ./webui/dist
COPY package.json ./
VOLUME ["/app/data"]
EXPOSE 3000
CMD ["node", "dist/index.js"]