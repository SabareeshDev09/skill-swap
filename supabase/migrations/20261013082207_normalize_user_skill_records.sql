DELETE FROM public.user_skills_teach AS skill
USING (
	SELECT id,
		row_number() OVER (PARTITION BY user_id, skill_id ORDER BY created_at, id) AS duplicate_number
	FROM public.user_skills_teach
) AS ranked
WHERE skill.id = ranked.id AND ranked.duplicate_number > 1;

DELETE FROM public.user_skills_learn AS skill
USING (
	SELECT id,
		row_number() OVER (PARTITION BY user_id, skill_id ORDER BY created_at, id) AS duplicate_number
	FROM public.user_skills_learn
) AS ranked
WHERE skill.id = ranked.id AND ranked.duplicate_number > 1;

CREATE UNIQUE INDEX IF NOT EXISTS user_skills_teach_user_skill_unique_idx
	ON public.user_skills_teach (user_id, skill_id);

CREATE UNIQUE INDEX IF NOT EXISTS user_skills_learn_user_skill_unique_idx
	ON public.user_skills_learn (user_id, skill_id);

CREATE OR REPLACE FUNCTION public.replace_user_skills(
	p_user_id UUID,
	p_teach_names TEXT[],
	p_learn_names TEXT[],
	p_no_teach BOOLEAN,
	p_teach_level TEXT,
	p_hourly_rate INT,
	p_experience_years NUMERIC,
	p_allowed_durations INT[],
	p_learn_level TEXT
) RETURNS VOID
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
	IF COALESCE(NULLIF(current_setting('request.jwt.claim.role', true), ''), NULLIF(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role') IS DISTINCT FROM 'service_role' THEN
		RAISE EXCEPTION 'Service role required' USING ERRCODE = '42501';
	END IF;

	INSERT INTO public.skill_taxonomy (name, category, min_hourly_rate, max_hourly_rate)
	SELECT names.skill_name, 'Other', 20, 1000
	FROM (
		SELECT DISTINCT ON (lower(clean_name)) clean_name AS skill_name
		FROM (
			SELECT regexp_replace(btrim(skill_name), '[[:space:]]+', ' ', 'g') AS clean_name
			FROM unnest(
				COALESCE(p_teach_names, ARRAY[]::TEXT[]) || COALESCE(p_learn_names, ARRAY[]::TEXT[])
			) AS requested(skill_name)
		) AS cleaned
		WHERE clean_name <> ''
		ORDER BY lower(clean_name), clean_name
	) AS names
	ON CONFLICT (lower(name)) DO NOTHING;

	DELETE FROM public.user_skills_teach WHERE user_id = p_user_id;
	DELETE FROM public.user_skills_learn WHERE user_id = p_user_id;

	IF NOT p_no_teach THEN
		INSERT INTO public.user_skills_teach (
			user_id, skill_id, level, years_experience, hourly_rate, allowed_durations
		)
		SELECT DISTINCT ON (taxonomy.id)
			p_user_id,
			taxonomy.id,
			p_teach_level,
			COALESCE(p_experience_years, 1),
			COALESCE(p_hourly_rate, taxonomy.min_hourly_rate),
			COALESCE(NULLIF(p_allowed_durations, ARRAY[]::INT[]), ARRAY[30, 45, 60, 90])
		FROM unnest(COALESCE(p_teach_names, ARRAY[]::TEXT[])) AS requested(skill_name)
		JOIN public.skill_taxonomy AS taxonomy
			ON lower(taxonomy.name) = lower(regexp_replace(btrim(requested.skill_name), '[[:space:]]+', ' ', 'g'))
		ORDER BY taxonomy.id;
	END IF;

	INSERT INTO public.user_skills_learn (user_id, skill_id, target_level, goal)
	SELECT DISTINCT ON (taxonomy.id)
		p_user_id,
		taxonomy.id,
		p_learn_level,
		'Looking to learn ' || taxonomy.name
	FROM unnest(COALESCE(p_learn_names, ARRAY[]::TEXT[])) AS requested(skill_name)
	JOIN public.skill_taxonomy AS taxonomy
		ON lower(taxonomy.name) = lower(regexp_replace(btrim(requested.skill_name), '[[:space:]]+', ' ', 'g'))
	ORDER BY taxonomy.id;
END;
$$;

REVOKE ALL ON FUNCTION public.replace_user_skills(UUID, TEXT[], TEXT[], BOOLEAN, TEXT, INT, NUMERIC, INT[], TEXT)
	FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.replace_user_skills(UUID, TEXT[], TEXT[], BOOLEAN, TEXT, INT, NUMERIC, INT[], TEXT)
	TO service_role;
