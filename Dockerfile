FROM ubuntu:latest

RUN apt update 
RUN apt upgrade -y 
RUN apt install -y curl
RUN curl -fsSL https://deb.nodesource.com/setup_16.x | bash -
RUN curl -sL https://dl.yarnpkg.com/debian/pubkey.gpg | gpg --dearmor | tee /usr/share/keyrings/yarnkey.gpg >/dev/null
RUN echo "deb [signed-by=/usr/share/keyrings/yarnkey.gpg] https://dl.yarnpkg.com/debian stable main" | tee /etc/apt/sources.list.d/yarn.list
RUN apt update
RUN apt install -y yarn nodejs
RUN apt install -y libgtk-3-0 libatk-bridge2.0-0 libnss3
RUN apt install -y ffmpeg xvfb
RUN npm install -g tree-sitter-cli 

COPY . /code-blocks

WORKDIR /code-blocks
RUN yarn run install:all 
RUN yarn run build:webview 
RUN yarn run pretest