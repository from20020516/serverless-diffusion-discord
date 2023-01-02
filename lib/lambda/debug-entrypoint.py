from app import main, Event
from datetime import datetime

event: Event = {
    'prompt': 'hatsune miku',
    'num_inference_steps': 20,
    'safety': False,
}

image = main(event)
image.save(f'./.images/{datetime.now().strftime("%Y_%m_%d-%I_%M_%S_%p")}.png')
