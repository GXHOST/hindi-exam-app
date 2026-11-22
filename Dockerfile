FROM node:20-alpine
WORKDIR /app
RUN npm install --omit=dev pg@8.13.1 --no-audit --no-fund
COPY server.js ./
COPY index.html ./public/
COPY css ./public/css
COPY js ./public/js
RUN mkdir -p /data
ENV PORT=1880 DATA_DIR=/data NODE_ENV=production
EXPOSE 1880
CMD ["node", "server.js"]
