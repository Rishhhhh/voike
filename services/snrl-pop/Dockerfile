FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install --only=production
COPY src ./src
EXPOSE 53/udp
EXPOSE 53/tcp
EXPOSE 8053
EXPOSE 853
CMD ["npm", "start"]
