-- Keep the database constraint aligned with the post types supported by CampusPulse.
-- Existing rows remain valid; this allows the current social-post RPCs to insert
-- campus updates, questions, polls, lost-and-found posts, and marketplace shares.
ALTER TABLE public.community_posts
  DROP CONSTRAINT IF EXISTS community_posts_post_type_check;

ALTER TABLE public.community_posts
  ADD CONSTRAINT community_posts_post_type_check
  CHECK (
    post_type = ANY (
      ARRAY[
        'safety_issue'::text,
        'suggestion'::text,
        'announcement'::text,
        'campus_update'::text,
        'question'::text,
        'poll'::text,
        'lost_found'::text,
        'marketplace_share'::text
      ]
    )
  );