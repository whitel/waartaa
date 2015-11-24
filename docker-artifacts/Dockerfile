FROM fedora
RUN dnf install -y nodejs npm #;dnf clean all
RUN dnf install -y tar
RUN dnf install -y mongodb
RUN mkdir /opt/waartaa
ADD https://github.com/whitel/waartaa/archive/0.2.tar.gz /opt/waartaa/
WORKDIR /opt/waartaa
RUN tar -xf 0.2.tar.gz
RUN ln -s /opt/waartaa/waartaa-0.2 /opt/waartaa/current-version
RUN adduser waartaa
RUN chown -R waartaa:waartaa /opt/waartaa
USER waartaa
WORKDIR /opt/waartaa/current-version
RUN curl https://install.meteor.com | /bin/sh
RUN npm install
#RUN cp server/settings-local.js-dist server/settings-local.js
