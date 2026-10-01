FROM node:24-bookworm-slim

RUN apt-get update && apt-get install -y --no-install-recommends git ripgrep ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /opt/bridge
COPY container/package.json ./package.json
RUN npm install --omit=dev --ignore-scripts
COPY container/ ./container/
RUN chmod +x container/pi.sh \
    && mkdir -p /workspace /home/node/.pi/agent \
    && chown -R node:node /workspace /home/node/.pi

ENV PATH="/opt/bridge/node_modules/.bin:${PATH}"
ENV PI_ACP_PI_COMMAND=/opt/bridge/container/pi.sh
ENV PI_CODING_AGENT_DIR=/home/node/.pi/agent
ENV WORKSPACE_DIR=/workspace
EXPOSE 8080
USER node
CMD ["node", "container/main.ts"]
