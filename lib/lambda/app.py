import gc
import json
import os
import requests
from typing import TypedDict, Optional
import tempfile
import boto3
import cv2
import numpy as np
from stable_diffusion_engine import StableDiffusionEngine
from diffusers import LMSDiscreteScheduler, PNDMScheduler # scheduler

DEFAULT_MODEL = "ShadowPower/waifu-diffusion.openvino"  # model name
DEFAULT_TOKENIZER = "openai/clip-vit-large-patch14"  # tokenizer
DEFAULT_SEED = None # random seed for generating consistent images per prompt
DEFAULT_BETA_START = 0.00085  # LMSDiscreteScheduler::beta_start
DEFAULT_BETA_END = 0.012  # LMSDiscreteScheduler::beta_end
DEFAULT_BETA_SCHEDULE = "scaled_linear"  # LMSDiscreteScheduler::beta_schedule
DEFAULT_NUM_INFERENCE_STEPS = 32  # num inference steps
DEFAULT_GUIDANCE_SCALE = 7.5  # guidance scale
DEFAULT_ETA = 0.0  # eta
DEFAULT_PROMPT = "Street-art painting of Sakura with tower in style of Banksy"  # prompt
DEFAULT_NEGATIVE_PROMPT = ""  # negative_prompt
DEFAULT_INIT_IMAGE = None  # path to initial image
DEFAULT_STRENGTH = 0.5 # how strong the initial image should be noised [0.0, 1.0]
DEFAULT_MASK = None  # mask of the region to inpaint on the initial image
DEFAULT_OUTPUT = "output"  # output image name

class Event(TypedDict):
    prompt: Optional[str]
    negative_prompt: Optional[str]
    num_inference_steps: Optional[int]
    init_image: Optional[str]
    mask: Optional[str]
    guidance_scale: Optional[float]
    seed: Optional[int]
    output: Optional[str]
    beta_start: Optional[float]
    beta_end: Optional[float]
    beta_schedule: Optional[str]
    eta: Optional[float]
    strength: Optional[float]
    model: Optional[str]
    tokenizer: Optional[str]

def imread_web(url):
    res = requests.get(url)
    img = None
    with tempfile.NamedTemporaryFile(dir='/tmp') as fp:
        fp.write(res.content)
        fp.file.seek(0)
        img = cv2.imread(fp.name)
    return img

def main(event: Event):
    gc.collect()
    seed = event.setdefault('seed', DEFAULT_SEED)
    if seed is None:
        import random
        seed = random.randint(0,4294967295)
    np.random.seed(seed)
    prompt = event.setdefault('prompt', DEFAULT_PROMPT)

    if event.setdefault('init_image', DEFAULT_INIT_IMAGE) is None:
        scheduler = LMSDiscreteScheduler(
            beta_start=event.setdefault('beta_start', DEFAULT_BETA_START),
            beta_end=event.setdefault('beta_end', DEFAULT_BETA_END),
            beta_schedule=event.setdefault('beta_schedule', DEFAULT_BETA_SCHEDULE),
            tensor_format="np"
        )
    else:
        scheduler = PNDMScheduler(
            beta_start=event.setdefault('beta_start', DEFAULT_BETA_START),
            beta_end=event.setdefault('beta_end', DEFAULT_BETA_END),
            beta_schedule=event.setdefault('beta_schedule', DEFAULT_BETA_SCHEDULE),
            skip_prk_steps = True,
            tensor_format="np"
        )
    engine = StableDiffusionEngine(
        scheduler = scheduler,
        model = event.setdefault('model', DEFAULT_MODEL),
        tokenizer = event.setdefault('tokenizer', DEFAULT_TOKENIZER),
    )
    image = engine(
        prompt = prompt,
        negative_prompt = event.setdefault('negative_prompt', DEFAULT_NEGATIVE_PROMPT),
        init_image = None if event.setdefault('init_image', DEFAULT_INIT_IMAGE) is None else imread_web(event['init_image']),
        mask = None if event.setdefault('mask', DEFAULT_MASK) is None else cv2.imread(imread_web(event['mask']), 0),
        strength = event.setdefault('strength', DEFAULT_STRENGTH),
        num_inference_steps = event.setdefault('num_inference_steps', DEFAULT_NUM_INFERENCE_STEPS),
        guidance_scale = event.setdefault('guidance_scale', DEFAULT_GUIDANCE_SCALE),
        eta = event.setdefault('eta', DEFAULT_ETA)
    )
    del engine
    gc.collect()
    return image

def handler(event: Event, context):
    bucketName = os.environ['BUCKET']
    image = main(event)
    cv2.imwrite('/tmp/output.png', image)
    objectName = event.setdefault('output', DEFAULT_OUTPUT)
    boto3.client('s3').upload_file('/tmp/output.png', bucketName, objectName)
    return  {"statusCode": 200, "body": {"bucket": bucketName, "output": objectName}}
