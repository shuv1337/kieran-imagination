import React, { useState } from 'react';
import { Upload, Sparkles, Image as ImageIcon, ArrowRight } from 'lucide-react';
import { generateColoringPage } from '../services/gemini';

interface GeneratorProps {
  onImageGenerated: (imageUrl: string, fileName: string, key?: string, publicUrl?: string) => void;
}

export const Generator: React.FC<GeneratorProps> = ({ onImageGenerated }) => {
  const [prompt, setPrompt] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [uploadedImage, setUploadedImage] = useState<string | null>(null);
  const suggestions = [
    'A dragon teaching penguins how to snowboard under the northern lights',
    'A cozy treehouse library with floating lanterns and a sleepy cat',
    'A robot dinosaur playing soccer on Mars with alien spectators',
    'A pirate ship sailing across clouds made of cotton candy',
    'A space otter astronaut watering a tiny moon garden',
    'A magical forest where the mushrooms are houses for fairies',
    'A group of hamsters having a tea party in a dollhouse',
    'A superhero dog saving a city made of building blocks',
    'A friendly monster baking cookies in a volcano kitchen',
    'A mermaid riding a seahorse through a coral reef city',
    'A castle made entirely of ice cream and candy',
    'A detective owl solving a mystery in a forest library',
    'A race car driving on a track made of rainbows',
    'A family of bears having a picnic on the moon',
    'A wizard cat casting spells on balls of yarn',
    'A submarine exploring an underwater city of glowing jellyfish',
    'A giant turtle carrying an island on its back',
    'A squirrel knight defending a castle of acorns',
    'A band of frogs playing instruments on lily pads',
    'A train traveling through a tunnel of stars',
    'A robot helping a gardener plant giant sunflowers',
    'A unicorn galloping through a field of crystal flowers',
    'A fox and a rabbit sharing a campfire story',
    'A city in the clouds with flying boats',
    'A baby elephant painting a masterpiece with its trunk',
    'A lighthouse guiding ships in a sea of stars',
    'A baker making a cake as tall as a skyscraper',
    'A group of penguins building a snow fort',
    'A time-traveling bicycle with wings',
    'A secret garden hidden inside a giant book',
    'A koala dj spinning records at a jungle party',
    'A sloth racing a snail on a branch',
    'A giraffe wearing a scarf and reading a newspaper',
    'A jellyfish wizard stirring potions in an underwater cauldron',
    'A baby dragon rolling cookie dough with a rolling pin twice its size',
    'A panda astronaut planting a flag on a giant floating donut planet',
    'A mouse chef making tiny pizzas in an acorn oven',
    'A camel exploring a desert made of giant hourglasses',
    'A kangaroo mail carrier delivering letters to cloud houses',
    'A chameleon painting a rainbow mural with its tail',
    'A family of owls flying kites made of leaves',
    'A friendly yeti roasting marshmallows in a snowy cave',
    'A squirrel scientist studying glowing acorns in a forest lab',
    'A whale floating through the sky carrying hot-air balloons',
    'A pair of raccoons running a cozy bakery at midnight',
    'A cactus cowboy riding a broomstick horse across the desert',
    'A wolf librarian shelving books in a magical moonlit archive',
    'A snail explorer navigating a maze of giant flowers',
    'A rabbit pilot flying a carrot-shaped airplane',
    'A tiny dragon curled up inside a teacup castle',
    'A family of turtles building sandcastles shaped like ancient ruins',
    'A robot cat tending to a garden of neon plants',
    'A fox detective following glowing footprints through a foggy village',
    'A polar bear sculpting ice statues under a rainbow sun',
    'A hedgehog barista serving tiny mugs of cocoa in a forest café',
    'A goat wizard brewing clouds into potions on a mountaintop',
    'A bee orchestra performing on honeycomb stages',
    'A hippo painter creating murals on floating bubbles',
    'A wizard frog teaching magic to tadpoles in a lily-pad classroom',
    'A space whale towing a constellation like a glowing net',
    'A family of ducks camping beside a river of sparkling stars',
    'A bear astronaut discovering a candy-planet meteor shower',
    'A fox riding a bicycle through a town filled with giant origami animals',
  ];

  const createFileName = (description: string) => {
    const cleaned = description
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, ' ')
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 8)
      .join('-');
    const base = cleaned || 'kierans-art';
    return `${base}-${Date.now()}.png`;
  };

  const handleLuckyPrompt = () => {
    const suggestion = suggestions[Math.floor(Math.random() * suggestions.length)];
    setPrompt(suggestion);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setUploadedImage(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleGenerate = async () => {
    if (!prompt && !uploadedImage) return;

    setIsGenerating(true);
    try {
      const effectivePrompt = prompt || "Convert this image into a fun coloring page.";
      const result = await generateColoringPage(effectivePrompt, uploadedImage || undefined);
      const fileName = createFileName(effectivePrompt);
      const preview = result.previewUrl || result.url;
      onImageGenerated(preview, fileName, result.key, result.url);
    } catch (error) {
      console.error(error);
      const message =
        error instanceof Error && error.message === 'SAFETY_BLOCKED'
          ? "The AI couldn't create that because the prompt triggered content restrictions. Please try a kid-friendly idea and avoid sensitive details."
          : "Oops! Something went wrong generating the image. Please try again.";
      alert(message);
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="w-full max-w-4xl mx-auto p-6 pt-12 flex flex-col gap-12">

      <div className="text-center order-2 md:order-1">
        <h1 className="text-6xl font-bold text-[#d6deeb] mb-6 tracking-tight font-fredoka">
          Dream it. <span className="text-[#82AAFF]">Color it.</span>
        </h1>
        <p className="text-xl text-[#5f7e97] max-w-2xl mx-auto">
          Enter Kieran's Imagination. Use AI to turn your wildest ideas or photos into amazing coloring pages instantly.
        </p>
      </div>

      {/* Main Card - Using Night Owl 'input.background' (#0b253a) as surface for contrast against #011627 */}
      <div className="bg-[#0b253a] rounded-3xl shadow-2xl shadow-[#011627]/50 p-8 border border-[#122d42] order-1 md:order-2">

        <div className="space-y-8">

          <div>
            <label className="block text-sm font-bold text-[#82AAFF] mb-2 uppercase tracking-wide">
              What do you want to create?
            </label>
            <div className="relative">
              {/* Input using input background and border colors */}
              <textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="E.g., A robot dinosaur playing soccer on Mars..."
                className="w-full p-5 text-lg bg-[#011627] border-2 border-[#5f7e97] text-[#d6deeb] rounded-2xl focus:border-[#82AAFF] focus:ring-0 transition-all outline-none resize-none h-36 placeholder-[#5f7e97]/50"
              />
              <button
                type="button"
                onClick={handleLuckyPrompt}
                className="absolute bottom-4 right-4 text-[#82AAFF] hover:text-white bg-[#0b253a] border border-[#234d70] rounded-full p-2 shadow-md shadow-[#011627]/50 transition-all hover:-translate-y-0.5"
                title="I'm feeling lucky"
              >
                <Sparkles size={20} />
              </button>
            </div>
          </div>

          <div className="flex flex-col md:flex-row gap-6">

            {/* Image Upload */}
            <div className="flex-1">
              <label className="block text-sm font-bold text-[#82AAFF] mb-2 uppercase tracking-wide">
                Use a Photo (Optional)
              </label>
              <div className="relative group h-[88px]">
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleFileChange}
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                />
                <div className={`h-full border-2 border-dashed rounded-2xl px-4 flex items-center gap-4 transition-all ${uploadedImage ? 'border-[#82AAFF] bg-[#234d70]/30' : 'border-[#5f7e97] bg-[#011627] group-hover:border-[#82AAFF]'}`}>
                  {uploadedImage ? (
                    <>
                      <div className="w-14 h-14 rounded-lg overflow-hidden bg-[#0b253a] shadow-sm shrink-0">
                        <img src={uploadedImage} alt="Reference" className="w-full h-full object-cover" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-[#d6deeb] truncate">Photo added!</p>
                        <p className="text-xs text-[#5f7e97]">Click to replace</p>
                      </div>
                      <button
                        onClick={(e) => {
                          e.preventDefault();
                          setUploadedImage(null);
                        }}
                        className="z-20 p-2 text-[#5f7e97] hover:text-[#EF5350]"
                      >
                        x
                      </button>
                    </>
                  ) : (
                    <>
                      <div className="w-10 h-10 rounded-full bg-[#0b253a] flex items-center justify-center text-[#5f7e97]">
                        <Upload size={20} />
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-[#d6deeb]">Upload Reference</p>
                        <p className="text-xs text-[#5f7e97]">Use a photo as a base</p>
                      </div>
                    </>
                  )}
                </div>
              </div>
            </div>

            {/* Action Button - Using Night Owl Button Color #7e57c2 */}
            <div className="flex-1">
              <label className="block text-sm font-bold text-transparent mb-2 uppercase tracking-wide select-none">
                Action
              </label>
              <button
                onClick={handleGenerate}
                disabled={isGenerating || (!prompt && !uploadedImage)}
                className="w-full h-[88px] bg-[#7e57c2] hover:bg-[#6c4ba6] disabled:bg-[#234d70] disabled:text-[#5f7e97] disabled:cursor-not-allowed text-white text-xl font-bold rounded-2xl shadow-lg hover:shadow-[#7e57c2]/25 hover:-translate-y-1 transition-all flex items-center justify-center gap-3"
              >
                {isGenerating ? (
                  <>
                    <div className="magic-loader"></div>
                    Creating Magic... (~30-45s)
                  </>
                ) : (
                  <>
                    Generate Page <ArrowRight size={24} />
                  </>
                )}
              </button>

              {isGenerating && (
                <div className="mt-4 p-4 bg-[#0b253a]/80 border border-[#82AAFF]/30 rounded-xl flex items-center gap-3 animate-pulse">
                  <Sparkles className="text-[#c792ea] shrink-0" size={20} />
                  <p className="text-[#d6deeb] text-sm">
                    <span className="font-bold text-[#82AAFF]">Please wait!</span> Generating high-quality line art takes about 30-45 seconds. We're drawing every detail...
                  </p>
                </div>
              )}
            </div>

          </div>

        </div>
      </div>

      {/* Features Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 order-3">
        <div className="flex items-center gap-4 p-5 bg-[#0b253a]/50 border border-[#122d42] rounded-2xl">
          <div className="p-3 bg-[#82AAFF]/10 text-[#82AAFF] rounded-xl">
            <ImageIcon size={24} />
          </div>
          <div>
            <h3 className="font-bold text-[#d6deeb]">Clean Line Art</h3>
            <p className="text-xs text-[#5f7e97]">Optimized for printing</p>
          </div>
        </div>
        <div className="flex items-center gap-4 p-5 bg-[#0b253a]/50 border border-[#122d42] rounded-2xl">
          <div className="p-3 bg-[#c792ea]/10 text-[#c792ea] rounded-xl">
            <Sparkles size={24} />
          </div>
          <div>
            <h3 className="font-bold text-[#d6deeb]">AI Editing</h3>
            <p className="text-xs text-[#5f7e97]">Modify with simple text</p>
          </div>
        </div>
        <div className="flex items-center gap-4 p-5 bg-[#0b253a]/50 border border-[#122d42] rounded-2xl">
          <div className="p-3 bg-[#ffeb95]/10 text-[#ffeb95] rounded-xl">
            <Upload size={24} />
          </div>
          <div>
            <h3 className="font-bold text-[#d6deeb]">Photo to Coloring Page</h3>
            <p className="text-xs text-[#5f7e97]">Convert memories to art</p>
          </div>
        </div>
      </div>
    </div>
  );
};
