FROM node:22-alpine AS builder
WORKDIR /app
COPY frontend-vue/package.json frontend-vue/package-lock.json* ./
RUN npm ci --ignore-scripts
COPY frontend-vue/ .
COPY shared/ ../shared/
COPY data/ ../data/
RUN npm run build

FROM nginx:alpine
COPY --from=builder /app/dist /usr/share/nginx/html
COPY frontend-vue/nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
