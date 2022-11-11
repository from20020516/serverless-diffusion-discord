FROM --platform=linux/amd64 python:3.9.9-slim-bullseye as base

WORKDIR /var/task

RUN apt-get update && apt-get install -y libgl1 libglib2.0-0

RUN python3 -m pip install awslambdaric
ADD https://github.com/aws/aws-lambda-runtime-interface-emulator/releases/latest/download/aws-lambda-rie /usr/bin/aws-lambda-rie
COPY entry.sh /
RUN chmod 755 /usr/bin/aws-lambda-rie /entry.sh

RUN python3 -m pip install \
    openvino==2022.1.0 \
    numpy==1.19.5 \
    opencv-python==4.5.5.64 \
    transformers==4.16.2 \
    diffusers==0.2.4 \
    tqdm==4.64.0 \
    huggingface_hub==0.9.0 \
    scipy==1.9.0 \
    streamlit==1.12.0 \
    watchdog==2.1.9 \
    ftfy==6.1.1
RUN python3 -m pip install boto3

#

FROM base as production

COPY stable_diffusion_engine.py app.py /var/task/

ENTRYPOINT [ "/entry.sh" ]
CMD [ "app.handler" ]
