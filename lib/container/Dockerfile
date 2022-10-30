FROM python:3.9.9-slim-bullseye

WORKDIR /src

RUN apt-get update && apt-get install -y libgl1 libglib2.0-0
COPY requirements.txt /src/
RUN pip3 install -r requirements.txt
COPY stable_diffusion_engine.py app.py /src/

ENTRYPOINT ["python3", "app.py"]
