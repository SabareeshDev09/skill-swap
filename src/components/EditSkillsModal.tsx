import React, { useState, useEffect } from 'react';
import { X, BookOpen, ArrowRightLeft } from 'lucide-react';
import SkillPicker from '@/components/SkillPicker';
import { Profile } from '@/lib/auth';

interface EditSkillsModalProps {
  isOpen: boolean;
  onClose: () => void;
  profile: Profile | null;
  onSave: (updatedProfile: Profile) => void | Promise<void>;
}

export const EditSkillsModal: React.FC<EditSkillsModalProps> = ({
  isOpen,
  onClose,
  profile,
  onSave,
}) => {
  const [teach, setTeach] = useState<string[]>([]);
  const [learn, setLearn] = useState<string[]>([]);
  const [noTeach, setNoTeach] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');

  useEffect(() => {
    if (profile && isOpen) {
      queueMicrotask(() => {
        setTeach(profile.teach || []);
        setLearn(profile.learn || []);
        setNoTeach(profile.noTeach || false);
      });
    }
  }, [profile, isOpen]);

  if (!isOpen || !profile) return null;

  const handleSave = async () => {
    const updatedProfile = {
      ...profile,
      teach: noTeach ? [] : teach,
      learn,
      noTeach,
    };
    setSaving(true);
    setSaveError('');
    try {
      await onSave(updatedProfile);
      onClose();
    } catch (error: unknown) {
      setSaveError(error instanceof Error ? error.message : 'Unable to save skills.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="relative w-full max-w-2xl max-h-[90vh] flex flex-col rounded-3xl border border-ink/10 bg-mist shadow-2xl overflow-hidden">
        {/* Fixed Header */}
        <div className="flex items-center justify-between border-b border-ink/10 px-6 py-4 sm:px-8 bg-mist shrink-0 z-10">
          <h2 className="text-xl font-display font-extrabold text-ink">Edit Skills</h2>
          <button
            onClick={onClose}
            className="rounded-full p-2 text-ink/50 hover:bg-ink/10 hover:text-ink transition-colors cursor-pointer"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Scrollable Body */}
        <div className="flex-1 overflow-y-auto p-6 sm:p-8 space-y-8">
          {saveError && (
            <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700">
              {saveError}
            </p>
          )}
          {/* Teach Skills */}
          <div>
            <h3 className="text-sm font-bold text-ink flex items-center gap-2 mb-4">
              <ArrowRightLeft className="h-4 w-4 text-lagoon" />
              Skills you can teach
            </h3>
            
            <SkillPicker
              value={teach}
              onChange={setTeach}
              max={5}
              disabled={noTeach}
            />

            <label className="mt-4 flex items-center gap-3 rounded-2xl bg-mist-pure/80 p-4 border border-ink/8 font-medium text-xs text-ink cursor-pointer hover:border-ink/20 transition-all select-none shadow-sm">
              <input
                type="checkbox"
                checked={noTeach}
                onChange={e => setNoTeach(e.target.checked)}
                className="size-4 rounded accent-lagoon cursor-pointer"
              />
              <span>I don&apos;t have any skills to teach right now (Learn-only mode)</span>
            </label>
          </div>

          {/* Learn Skills */}
          <div>
            <h3 className="text-sm font-bold text-ink flex items-center gap-2 mb-4">
              <BookOpen className="h-4 w-4 text-saffron" />
              Skills you want to learn
            </h3>
            
            <SkillPicker
              value={learn}
              onChange={setLearn}
              max={5}
            />
          </div>
        </div>

        {/* Fixed Footer */}
        <div className="flex justify-end gap-3 px-6 py-4 sm:px-8 border-t border-ink/10 bg-mist shrink-0 z-10">
          <button
            onClick={onClose}
            className="rounded-full px-5 py-2.5 text-xs font-semibold text-ink/70 hover:text-ink hover:bg-mist-pure transition-all cursor-pointer"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="rounded-full bg-lagoon px-6 py-2.5 text-xs font-bold text-white hover:bg-lagoon-dark shadow-md transition-all cursor-pointer disabled:opacity-50"
          >
            {saving ? 'Saving...' : 'Save Skills'}
          </button>
        </div>
      </div>
    </div>
  );
};
