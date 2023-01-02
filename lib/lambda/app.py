from typing import TypedDict, Optional
from diffusers import StableDiffusionPipeline, StableDiffusionImg2ImgPipeline
import torch
import PIL
import boto3
import requests
import random
import cv2
import gc
import os
from datetime import datetime
import tempfile

DEVICE = 'cpu'

class Event(TypedDict):
    prompt: Optional[str]
    negative_prompt: Optional[str]
    num_inference_steps: Optional[int]
    init_image: Optional[str]
    guidance_scale: Optional[float]
    seed: Optional[int]
    output: Optional[str]
    eta: Optional[float]
    strength: Optional[float]
    model: Optional[str]
    safety: Optional[bool]

def imread_web(url: str, flags: int = None):
    res = requests.get(url)
    img = None
    with tempfile.NamedTemporaryFile(dir='/tmp') as fp:
        fp.write(res.content)
        fp.file.seek(0)
        img = cv2.imread(fp.name, flags)
    return img

def main(event: Event):
    gc.collect()
    model = event.setdefault('model', 'hakurei/waifu-diffusion')
    init_image = event.setdefault('init_image', None)

    pipe = StableDiffusionImg2ImgPipeline.from_pretrained(model) if init_image else StableDiffusionPipeline.from_pretrained(model)
    pipe.to(DEVICE)

    if not event.setdefault('safety', None):
        pipe.safety_checker = lambda images, **kwargs: (images, False)

    seed = event.setdefault('seed', random.randint(0, 4294967295))
    generator = torch.Generator(DEVICE).manual_seed(seed)

    prompt = event.setdefault('prompt', '')
    negative_prompt = event.setdefault('negative_prompt', '')
    num_inference_steps = event.setdefault('num_inference_steps', 32)
    guidance_scale = event.setdefault('guidance_scale', 7.5)
    eta = event.setdefault('eta', 0.0)
    strength = event.setdefault('strength', 0.5)

    if init_image:
        image = pipe(
            prompt = prompt,
            image = PIL.Image.fromarray(imread_web(init_image)),
            strength = strength,
            num_inference_steps = num_inference_steps,
            guidance_scale = guidance_scale,
            negative_prompt = negative_prompt,
            eta = eta,
            generator = generator,
        ).images[0]
    else:
        image = pipe(
            prompt = prompt,
            num_inference_steps = num_inference_steps,
            guidance_scale = guidance_scale,
            negative_prompt = negative_prompt,
            eta = eta,
            generator = generator,
        ).images[0]
    gc.collect()
    return image

def handler(event: Event, context):
    bucketName = os.environ['BUCKET']
    image = main(event)
    image.save('/tmp/output.png')
    objectName = event.setdefault('output', f'{datetime.now().strftime("%Y_%m_%d-%I_%M_%S_%p")}.png')
    boto3.client('s3').upload_file('/tmp/output.png', bucketName, objectName)
    return  {"statusCode": 200, "body": {"bucket": bucketName, "output": objectName}}
