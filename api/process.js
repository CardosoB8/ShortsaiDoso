const { GoogleGenerativeAI } = require('@google/generative-ai');
const ffmpeg = require('fluent-ffmpeg');
const ffmpegPath = require('ffmpeg-static');
const ffprobePath = require('ffprobe-static');
const fs = require('fs');
const path = require('path');

// Use os caminhos estáticos para FFmpeg e FFprobe
ffmpeg.setFfmpegPath(ffmpegPath);
ffmpeg.setFfprobePath(ffprobePath);

// Configurar o Gemini com a variável de ambiente
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-1.5-pro" });

// Define o caminho para o arquivo de vídeo que está no seu projeto
const videoFilePath = path.join(__dirname, 'meu_video.mp4');

// Esta é a função que a Vercel vai executar
module.exports = async (req, res) => {
    try {
        // Verifica se o arquivo de vídeo existe no projeto
        if (!fs.existsSync(videoFilePath)) {
            return res.status(404).json({ error: 'Arquivo de vídeo não encontrado no servidor.' });
        }

        // 1. Extrair áudio do arquivo de vídeo
        const audioBuffer = await new Promise((resolve, reject) => {
            const chunks = [];
            ffmpeg(videoFilePath)
                .toFormat('mp3')
                .on('end', () => resolve(Buffer.concat(chunks)))
                .on('error', (err) => reject(new Error('Falha na extração de áudio: ' + err.message)))
                .pipe();

            // Usa o 'pipe' para capturar o áudio em um buffer
            ffmpeg(videoFilePath).toFormat('mp3').pipe().on('data', chunk => chunks.push(chunk));
        });
        
        // 2. Transcrever áudio com o Gemini
        const filePart = {
            mimeType: 'audio/mp3',
            fileData: audioBuffer,
        };

        const prompt = `Analise este áudio e identifique os 3 trechos mais interessantes, importantes ou com maior clímax, indicando o tempo de início e fim exatos de cada trecho. Responda apenas com um JSON, no seguinte formato:
        {
          "shorts": [
            {"start": "00:01:25", "end": "00:01:50"},
            {"start": "00:02:10", "end": "00:02:45"},
            {"start": "00:03:00", "end": "00:03:30"}
          ]
        }`;

        const result = await model.generateContent([prompt, filePart]);
        const responseText = result.response.text();
        const shortsData = JSON.parse(responseText.replace(/```json|```/g, '').trim());

        if (!shortsData || !shortsData.shorts || shortsData.shorts.length === 0) {
            return res.status(500).json({ error: 'A IA não conseguiu identificar os trechos.' });
        }

        // 3. Cortar o vídeo
        const processedShorts = [];

        for (const short of shortsData.shorts) {
            const outputBuffer = await new Promise((resolve, reject) => {
                const chunks = [];
                ffmpeg(videoFilePath)
                    .setStartTime(short.start)
                    .setDuration(new Date(`1970-01-01T${short.end}Z`).getTime() - new Date(`1970-01-01T${short.start}Z`).getTime())
                    .toFormat('mp4')
                    .on('end', () => resolve(Buffer.concat(chunks)))
                    .on('error', (err) => reject(new Error('Falha no corte do vídeo: ' + err.message)))
                    .pipe();
                
                // Captura o vídeo em um buffer
                ffmpeg(videoFilePath).setStartTime(short.start).setDuration(new Date(`1970-01-01T${short.end}Z`).getTime() - new Date(`1970-01-01T${short.start}Z`).getTime()).toFormat('mp4').pipe().on('data', chunk => chunks.push(chunk));
            });
            
            processedShorts.push({
                start: short.start,
                end: short.end,
                data: outputBuffer.toString('base64')
            });
        }

        res.json({ shorts: processedShorts });

    } catch (error) {
        console.error('Erro de processamento:', error);
        res.status(500).json({ error: error.message || 'Ocorreu um erro no servidor.' });
    }
};
