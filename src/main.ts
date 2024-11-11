import './style.css'

const WIDTH = 144;
const HEIGHT = 144;
const RENDER_SCALE = 4;

const PARTICLE_COUNT = 10000;

function sensor_sd(distance: number) {
    const variance = Math.max(distance * 0.05, 0.590551);

    return variance / 3;
}

document.querySelector<HTMLDivElement>('#app')!.innerHTML = `
  <div>
    <canvas id="canvas" width=${WIDTH * RENDER_SCALE} height=${HEIGHT * RENDER_SCALE} />
  </div>
`

const canvas = document.querySelector<HTMLCanvasElement>('#canvas');
const ctx = canvas?.getContext("2d")!;

function render(max_weight: number, predicted_x: number, predicted_y: number) {
    function circle(x: number, y: number, radius: number) {
        ctx.beginPath();
        ctx.arc(x, y, radius, 0, 2 * Math.PI);
        ctx.fill();
    }

    ctx.clearRect(0, 0, WIDTH * RENDER_SCALE, HEIGHT * RENDER_SCALE);

    for (const particle of particles)
    {
        ctx.fillStyle = `rgba(0, 0, 255, ${particle.weight / max_weight})`;
        circle(particle.x * RENDER_SCALE, particle.y * RENDER_SCALE, 2);
    }
    
    ctx.fillStyle = `rgb(0, 255, 0)`;
    circle(robot_x * RENDER_SCALE, robot_y * RENDER_SCALE, 2);
    ctx.beginPath();
    ctx.moveTo(robot_x * RENDER_SCALE, robot_y * RENDER_SCALE);
    ctx.lineTo(robot_x * RENDER_SCALE + Math.cos(robot_theta) * 10, robot_y * RENDER_SCALE + Math.sin(robot_theta) * 10);
    ctx.stroke();
    
    ctx.fillStyle = `rgb(255, 0, 0)`;
    circle(predicted_x * RENDER_SCALE, predicted_y * RENDER_SCALE, 2);
}

function sensor_value(theta_offset: number) {
    const left_t = (0 - robot_x) / Math.cos(robot_theta + theta_offset);
    const right_t = (144 - robot_x) / Math.cos(robot_theta + theta_offset);
    const bottom_t = (0 - robot_y) / Math.sin(robot_theta + theta_offset);
    const top_t = (144 - robot_y) / Math.sin(robot_theta + theta_offset);

    const left_y = robot_y + left_t * Math.sin(robot_theta + theta_offset)
    if (left_t > 0 && left_y >= 0 && left_y <= 144) {
        return Math.sqrt((robot_x - 0)**2 + (robot_y - left_y)**2);
    }

    const right_y = robot_y + right_t * Math.sin(robot_theta + theta_offset)
    if (right_t > 0 && right_y >= 0 && right_y <= 144) {
        return Math.sqrt((robot_x - 144)**2 + (robot_y - right_y)**2);
    }

    const bottom_x = robot_x + bottom_t * Math.cos(robot_theta + theta_offset)
    if (bottom_t > 0 && bottom_x >= 0 && bottom_x <= 144) {
        return Math.sqrt((robot_x - bottom_x)**2 + (robot_y - 0)**2);
    }

    const top_x = robot_x + top_t * Math.cos(robot_theta + theta_offset)
    if (top_t > 0 && top_x >= 0 && top_x <= 144) {
        return Math.sqrt((robot_x - top_x)**2 + (robot_y - 144)**2);
    }

    return NaN;
}

interface Particle {
    x: number,
    y: number,
    weight: number,
}

const particles = new Array<Particle>();

let robot_x = 48;
let robot_y = 24;
let robot_theta = Math.PI / 4 + Math.PI / 6;

function resample() {
    particles.length = 0;

    for (let i = 0; i < PARTICLE_COUNT; i++) {
        particles.push({
            x: Math.random() * 144,
            y: Math.random() * 144,
            weight: 1
        });
    }
}

function sensor_update() {
    function normal_dist(x: number, mu: number, sd: number) {
        const epsilon = 0.0000000000001;

        return  Math.max(
                (Math.E ** (-1/2 * ((x - mu) / sd) ** 2))
                /
                (sd * Math.sqrt(2 * Math.PI)),
                epsilon);
    }

    const sensor_front = sensor_value(0);
    const sensor_left = sensor_value(Math.PI / 2);
    const sensor_right = sensor_value(-Math.PI / 2);

    const theta_left = robot_theta + Math.PI / 2;
    const theta_right = robot_theta - Math.PI / 2;

    const front_x_predict = Math.cos(robot_theta) > 0 ? 144 - sensor_front * Math.cos(robot_theta) : -sensor_front * Math.cos(robot_theta);
    const front_y_predict = Math.sin(robot_theta) > 0 ? 144 - sensor_front * Math.sin(robot_theta) : -sensor_front * Math.sin(robot_theta);
    
    const left_x_predict = Math.cos(theta_left) > 0 ? 144 - sensor_left * Math.cos(theta_left) : -sensor_left * Math.cos(theta_left);
    const left_y_predict = Math.sin(theta_left) > 0 ? 144 - sensor_left * Math.sin(theta_left) : -sensor_left * Math.sin(theta_left);
    
    const right_x_predict = Math.cos(theta_right) > 0 ? 144 - sensor_right * Math.cos(theta_right) : -sensor_right * Math.cos(theta_right);
    const right_y_predict = Math.sin(theta_right) > 0 ? 144 - sensor_right * Math.sin(theta_right) : -sensor_right * Math.sin(theta_right);

    for (const particle of particles) {
        particle.weight =
            Math.max(normal_dist(particle.x, front_x_predict, sensor_sd(sensor_front)),
                     normal_dist(particle.y, front_y_predict, sensor_sd(sensor_front))) *
            Math.max(normal_dist(particle.x, left_x_predict, sensor_sd(sensor_left)),
                     normal_dist(particle.y, left_y_predict, sensor_sd(sensor_left))) *
            Math.max(normal_dist(particle.x, right_x_predict, sensor_sd(sensor_right)),
                     normal_dist(particle.y, right_y_predict, sensor_sd(sensor_right)));
    }
}

setInterval(() => {
    resample();
    sensor_update();
    
    particles.sort((a, b) => b.weight - a.weight);
    
    let predicted_x = 0;
    let predicted_y = 0;
    let total_weight = 0;
    for (const particle of particles)
    {
        predicted_x += particle.x * particle.weight;
        predicted_y += particle.y * particle.weight;
        total_weight += particle.weight;
    }
    predicted_x /= total_weight;
    predicted_y /= total_weight;
    
    render(particles[0].weight, predicted_x, predicted_y);
    
    console.log(Math.sqrt((robot_x - predicted_x) ** 2 +  (robot_y - predicted_y) ** 2));
}, 1000);