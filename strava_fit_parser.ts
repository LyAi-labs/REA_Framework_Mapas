export class FitBinaryParser {
    public analizarEstructuraBinariaFIT(buffer: any) {
        // Los archivos FIT extraen registros directamente de ráfagas binarias
        let registroLectura = {
            timestamp: buffer.readUInt32LE(4),
            latitudSemicirculos: buffer.readInt32LE(8),  
            longitudSemicirculos: buffer.readInt32LE(12),
            altitudEscalada: (buffer.readUInt16LE(16) / 5) - 500 
        };
        return registroLectura;
    }
}
