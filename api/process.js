const { GoogleGenerativeAI } = require('@google/generative-ai');
const Busboy = require('busboy');
const ffmpeg = require('fluent-ffmpeg');
const ffmpegPath = require('ffmpeg-static');
const ffprobePath = require('ffprobe-static');
const { Readable } = require('stream');

// Usa os caminhos estáticos para FFmpeg e FFprobe
ffmpeg.setFfmpegPath(ffmpegPath);
ffmpeg.setFfprobePath(ffprobePath);

// Configura o Gemini com a variável de ambiente
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-1.5-pro" });

// Esta é a função que a Vercel vai executar
module.exports = async (req, res) => {
    if (req.method !== 'POST') {
        return res.status(405).send('Método não permitido.');
    }

    let videoBuffer = null;
    
    // Encapsula o processo do Busboy em uma Promise
    const busboyProcess = new Promise((resolve, reject) => {
        const busboy = Busboy({ headers: req.headers });
        
        busboy.on('file', (fieldname, file, filename, encoding, mimetypeParam) => {
            const chunks = [];
            file.on('data', chunk => chunks.push(chunk));
            file.on('end', () => {
                videoBuffer = Buffer.concat(chunks);
            });
            file.on('error', reject);
        });

        busboy.on('finish', () => resolve());
        busboy.on('error', reject);
        
        req.pipe(busboy);
    });

    try {
        await busboyProcess;

        if (!videoBuffer) {
            return res.status(400).send('Nenhum vídeo foi enviado ou o upload falhou.');
        }

        // 1. Extrai áudio do buffer do vídeo
        const audioBuffer = await new Promise((resolve, reject) => {
            const chunks = [];
            const readableStream = new Readable();
            readableStream._read = () => {}; 
            readableStream.push(videoBuffer);
            readableStream.push(null); 

            ffmpeg(readableStream) // Passa o stream diretamente para o FFmpeg
                .toFormat('mp3')
                .on('end', () => resolve(Buffer.concat(chunks)))
                .on('error', (err) => reject(new Error('Falha na extração de áudio: ' + err.message)))
                .pipe();

            readableStream.pipe(ffmpeg().toFormat('mp3'));
        });

        // 2. Transcreve áudio com o Gemini
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

        // 3. Corta o vídeo
        const processedShorts = [];

        for (const short of shortsData.shorts) {
            const outputBuffer = await new Promise((resolve, reject) => {
                const chunks = [];
                const readableStream = new Readable();
                readableStream._read = () => {};
                readableStream.push(videoBuffer);
                readableStream.push(null);

                ffmpeg(readableStream) // Passa o stream diretamente para o FFmpeg
                    .setStartTime(short.start)
                    .setDuration(new Date(`1970-01-01T${short.end}Z`).getTime() - new Date(`1970-01-01T${short.start}Z`).getTime())
                    .toFormat('mp4')
                    .on('end', () => resolve(Buffer.concat(chunks)))
                    .on('error', (err) => reject(new Error('Falha no corte do vídeo: ' + err.message)))
                    .pipe();

                readableStream.pipe(ffmpeg().setStartTime(short.start).setDuration(new Date(`1970-01-01T${short.end}Z`).getTime() - new Date(`1970-01-01T${short.start}Z`).getTime()).toFormat('mp4'));
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
