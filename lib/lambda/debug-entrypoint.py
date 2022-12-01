from app import main, Event
import cv2
import time

event: Event = {
    'prompt': 'hatsune miku',
    'num_inference_steps': 20
}

image = main(event)
cv2.imwrite('.images/{dt}.png'.format(dt=time.strftime("%Y%m%d%H%M%S")), image)
