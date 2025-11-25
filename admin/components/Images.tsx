import React, { useEffect, useState, useCallback } from 'react';
import { getImages, type ImageEntry } from '../services/api';

const sourceFilters = [
    { label: 'All', value: '' },
    { label: 'Generated', value: 'generate' },
    { label: 'Edited', value: 'edit' },
    { label: 'Upscaled', value: 'upscale' },
    { label: 'Uploaded', value: 'upload' },
];

const Images: React.FC = () => {
    const [images, setImages] = useState<ImageEntry[]>([]);
    const [loading, setLoading] = useState(true);
    const [source, setSource] = useState('');
    const [offset, setOffset] = useState(0);
    const [selectedImage, setSelectedImage] = useState<ImageEntry | null>(null);
    const limit = 24;

    const fetchImages = useCallback(async () => {
        setLoading(true);
        try {
            const data = await getImages(limit, offset, source || undefined);
            setImages(data.images);
        } catch (err) {
            console.error('Failed to load images:', err);
        } finally {
            setLoading(false);
        }
    }, [offset, source]);

    useEffect(() => {
        fetchImages();
    }, [fetchImages]);

    const formatDate = (timestamp: number) => {
        return new Date(timestamp).toLocaleString();
    };

    const getSourceBadge = (src: string) => {
        const colors: Record<string, string> = {
            generate: 'bg-purple-100 text-purple-800',
            edit: 'bg-blue-100 text-blue-800',
            upscale: 'bg-green-100 text-green-800',
            upload: 'bg-gray-100 text-gray-800',
        };
        return (
            <span className={`px-2 py-1 text-xs rounded-full ${colors[src] || 'bg-gray-100 text-gray-800'}`}>
                {src}
            </span>
        );
    };

    return (
        <div>
            <div className="flex justify-between items-center mb-6">
                <h2 className="text-2xl font-bold">Images</h2>
                <div className="flex gap-2">
                    {sourceFilters.map((filter) => (
                        <button
                            key={filter.value}
                            onClick={() => {
                                setSource(filter.value);
                                setOffset(0);
                            }}
                            className={`px-4 py-2 rounded-lg text-sm ${
                                source === filter.value
                                    ? 'bg-blue-600 text-white'
                                    : 'bg-gray-200 hover:bg-gray-300'
                            }`}
                        >
                            {filter.label}
                        </button>
                    ))}
                </div>
            </div>

            {loading ? (
                <div className="text-center py-12">Loading...</div>
            ) : (
                <>
                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-4">
                        {images.map((image) => (
                            <div
                                key={image.id}
                                className="bg-white rounded-lg shadow overflow-hidden cursor-pointer hover:shadow-lg transition-shadow"
                                onClick={() => setSelectedImage(image)}
                            >
                                <div className="aspect-[3/4] bg-gray-100">
                                    <img
                                        src={image.publicUrl}
                                        alt={image.prompt}
                                        className="w-full h-full object-cover"
                                        loading="lazy"
                                    />
                                </div>
                                <div className="p-2">
                                    <p className="text-xs text-gray-500 truncate" title={image.prompt}>
                                        {image.prompt}
                                    </p>
                                    <div className="mt-1">{getSourceBadge(image.source)}</div>
                                </div>
                            </div>
                        ))}
                    </div>

                    {images.length === 0 && (
                        <div className="text-center py-12 text-gray-500">No images found</div>
                    )}

                    <div className="flex justify-between items-center mt-6">
                        <button
                            onClick={() => setOffset(Math.max(0, offset - limit))}
                            disabled={offset === 0}
                            className="px-4 py-2 bg-gray-200 rounded-lg disabled:opacity-50"
                        >
                            Previous
                        </button>
                        <span className="text-sm text-gray-500">
                            Showing {offset + 1} - {offset + images.length}
                        </span>
                        <button
                            onClick={() => setOffset(offset + limit)}
                            disabled={images.length < limit}
                            className="px-4 py-2 bg-gray-200 rounded-lg disabled:opacity-50"
                        >
                            Next
                        </button>
                    </div>
                </>
            )}

            {selectedImage && (
                <div
                    className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center p-4 z-50"
                    onClick={() => setSelectedImage(null)}
                >
                    <div
                        className="bg-white rounded-xl max-w-2xl w-full max-h-[90vh] overflow-auto"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <img
                            src={selectedImage.publicUrl}
                            alt={selectedImage.prompt}
                            className="w-full"
                        />
                        <div className="p-4">
                            <p className="font-medium mb-2">{selectedImage.prompt}</p>
                            <div className="flex gap-2 flex-wrap text-sm text-gray-500">
                                {getSourceBadge(selectedImage.source)}
                                <span>{formatDate(selectedImage.created_at)}</span>
                            </div>
                            <button
                                onClick={() => setSelectedImage(null)}
                                className="mt-4 w-full px-4 py-2 bg-gray-200 rounded-lg hover:bg-gray-300"
                            >
                                Close
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default Images;
