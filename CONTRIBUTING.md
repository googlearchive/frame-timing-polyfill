We use a "codereview when it seems important" style. Simple changes can be
committed/pushed to origin/master anytime. For larger development work where
codereview is useful:

1. Make a branch:

git checkout -t -b my_branch origin/master


2. Make some commits...


3. When you're ready for review

git cl upload

The contents of the branch will be uploaded, but squashed.

4. When you have lgtm:
git cl land

