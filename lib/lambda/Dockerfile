FROM --platform=linux/amd64 python:3.9.9-slim-bullseye as base

WORKDIR /var/task

RUN apt-get update && apt-get install -y libgl1 libglib2.0-0
RUN python3 -m pip install \
    openvino==2022.1.0 \
    diffusers==0.11.1 \
    ftfy==6.1.1 \
    huggingface_hub==0.9.0 \
    numpy==1.19.5 \
    opencv-python==4.5.5.64 \
    scipy==1.9.0 \
    streamlit==1.12.0 \
    tqdm==4.64.0 \
    transformers==4.25.1 \
    watchdog==2.1.9 \
    boto3

#

FROM --platform=linux/amd64 node:16 as node
FROM base as development

COPY --from=node /usr/local/bin/node /usr/local/bin/node
COPY --from=node /usr/local/lib/node_modules/ /usr/local/lib/node_modules
RUN ln -s /usr/local/lib/node_modules/npm/bin/npm-cli.js /usr/local/bin/npm \
    && ln -s /usr/local/lib/node_modules/npm/bin/npx-cli.js /usr/local/bin/npx
COPY --from=amazon/aws-cli /usr/local/aws-cli/v2/current /usr/local
COPY --from=docker /usr/local/bin/docker /usr/local/bin/docker
COPY --from=docker /usr/local/bin/docker-compose /usr/local/bin/docker-compose
RUN apt-get install -y git

ENTRYPOINT [ "/bin/bash" ]

#

FROM base as production

RUN python3 -m pip install awslambdaric
ADD https://github.com/aws/aws-lambda-runtime-interface-emulator/releases/latest/download/aws-lambda-rie /usr/bin/aws-lambda-rie
COPY ./lib/lambda/entry.sh /
RUN chmod 755 /usr/bin/aws-lambda-rie /entry.sh

COPY ./lib/lambda/app.py /var/task/

ENTRYPOINT [ "/entry.sh" ]
CMD [ "app.handler" ]
